package engine

import (
	"fmt"
	"log"
	"sync"
)

// TrafficDecisionAction represents the outcome of evaluating a vehicle's path release request.
type TrafficDecisionAction string

const (
	// DecisionReleaseNext indicates the next horizon node/edge is clear and can be released into Base.
	DecisionReleaseNext TrafficDecisionAction = "RELEASE_NEXT"
	// DecisionWait indicates the next node/edge is locked; the AGV must wait at the end of its current Base.
	DecisionWait TrafficDecisionAction = "WAIT"
	// DecisionReroute indicates the wait time exceeded threshold; a dynamic detour path has been computed.
	DecisionReroute TrafficDecisionAction = "REROUTE"
)

// TrafficDecision encapsulates the decision and any recommended rerouting waypoints.
type TrafficDecision struct {
	Action        TrafficDecisionAction `json:"action"`
	Reason        string                `json:"reason"`
	SuggestedPath []string              `json:"suggested_path,omitempty"` // New node IDs if rerouting
}

// ITrafficController defines the strategy pattern interface for fleet traffic control.
type ITrafficController interface {
	Name() string
	EvaluateRelease(agvID string, currentBase []string, horizon []string, registry *ResourceRegistry, layoutMgr *LayoutManager) TrafficDecision
	RecordVehicleWait(agvID string, waitSec float64)
	ResetVehicleWait(agvID string)
}

// ---------------------------------------------------------------------
// Strategy A: WaitTrafficStrategy (死等淨空策略)
// ---------------------------------------------------------------------
// Strictly checks if the next horizon node/edge is locked.
// If locked, rejects release, forcing the AGV to wait at its current base terminus.
type WaitTrafficStrategy struct {
	mu            sync.RWMutex
	waitTimes     map[string]float64 // agvID -> accumulated wait seconds
}

func NewWaitTrafficStrategy() *WaitTrafficStrategy {
	return &WaitTrafficStrategy{
		waitTimes: make(map[string]float64),
	}
}

func (s *WaitTrafficStrategy) Name() string {
	return "wait"
}

func (s *WaitTrafficStrategy) RecordVehicleWait(agvID string, waitSec float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.waitTimes[agvID] += waitSec
}

func (s *WaitTrafficStrategy) ResetVehicleWait(agvID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.waitTimes, agvID)
}

func (s *WaitTrafficStrategy) EvaluateRelease(agvID string, currentBase []string, horizon []string, registry *ResourceRegistry, layoutMgr *LayoutManager) TrafficDecision {
	if len(horizon) == 0 {
		return TrafficDecision{
			Action: DecisionReleaseNext,
			Reason: "No remaining horizon nodes",
		}
	}

	nextHorizonNode := horizon[0]
	locked, owner := registry.IsNodeLocked(nextHorizonNode)
	if locked && owner != agvID {
		return TrafficDecision{
			Action: DecisionWait,
			Reason: fmt.Sprintf("Node %s is currently locked by %s (WaitTrafficStrategy)", nextHorizonNode, owner),
		}
	}

	return TrafficDecision{
		Action: DecisionReleaseNext,
		Reason: fmt.Sprintf("Node %s is clear for release", nextHorizonNode),
	}
}

// ---------------------------------------------------------------------
// Strategy B: RerouteTrafficStrategy (動態繞路策略)
// ---------------------------------------------------------------------
// Evaluates node availability. If locked and accumulated wait time exceeds threshold,
// triggers A* path recalculation avoiding congested nodes.
type RerouteTrafficStrategy struct {
	mu             sync.RWMutex
	waitTimes      map[string]float64 // agvID -> accumulated wait seconds
	waitThreshold  float64            // Seconds before triggering reroute (default: 3.0s in simulation)
}

func NewRerouteTrafficStrategy(waitThresholdSec float64) *RerouteTrafficStrategy {
	if waitThresholdSec <= 0 {
		waitThresholdSec = 3.0
	}
	return &RerouteTrafficStrategy{
		waitTimes:     make(map[string]float64),
		waitThreshold: waitThresholdSec,
	}
}

func (s *RerouteTrafficStrategy) Name() string {
	return "reroute"
}

func (s *RerouteTrafficStrategy) RecordVehicleWait(agvID string, waitSec float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.waitTimes[agvID] += waitSec
}

func (s *RerouteTrafficStrategy) ResetVehicleWait(agvID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.waitTimes, agvID)
}

func (s *RerouteTrafficStrategy) EvaluateRelease(agvID string, currentBase []string, horizon []string, registry *ResourceRegistry, layoutMgr *LayoutManager) TrafficDecision {
	if len(horizon) == 0 {
		return TrafficDecision{
			Action: DecisionReleaseNext,
			Reason: "No remaining horizon nodes",
		}
	}

	nextHorizonNode := horizon[0]
	locked, owner := registry.IsNodeLocked(nextHorizonNode)
	if !locked || owner == agvID {
		s.ResetVehicleWait(agvID)
		return TrafficDecision{
			Action: DecisionReleaseNext,
			Reason: fmt.Sprintf("Node %s is clear for release", nextHorizonNode),
		}
	}

	// Node is locked by another AGV!
	s.mu.RLock()
	currentWait := s.waitTimes[agvID]
	s.mu.RUnlock()

	if currentWait < s.waitThreshold {
		return TrafficDecision{
			Action: DecisionWait,
			Reason: fmt.Sprintf("Node %s locked by %s; waiting (%.1fs / %.1fs)", nextHorizonNode, owner, currentWait, s.waitThreshold),
		}
	}

	// Wait threshold exceeded! Attempt dynamic detour using A* avoiding locked node
	if len(currentBase) == 0 {
		return TrafficDecision{
			Action: DecisionWait,
			Reason: "Cannot reroute without base reference point",
		}
	}

	startNode := currentBase[len(currentBase)-1]
	finalDestination := horizon[len(horizon)-1]

	if startNode == finalDestination {
		return TrafficDecision{
			Action: DecisionReleaseNext,
			Reason: "Already at destination",
		}
	}

	// Collect all currently locked nodes as obstacles
	lockedNodes, _ := registry.GetSnapshot()
	blockedSet := make(map[string]bool)
	for nID, holder := range lockedNodes {
		if holder != agvID && nID != finalDestination {
			blockedSet[nID] = true
		}
	}

	// Perform A* search with blocked nodes excluded
	altWaypoints, _, err := layoutMgr.FindPathAvoiding(startNode, finalDestination, blockedSet)
	if err == nil && len(altWaypoints) > 0 {
		suggestedNodeIDs := make([]string, len(altWaypoints))
		for i, w := range altWaypoints {
			suggestedNodeIDs[i] = w.ID
		}

		log.Printf("[TRAFFIC REROUTE] AGV %s rerouting from %s to %s via: %v (avoiding %v)",
			agvID, startNode, finalDestination, suggestedNodeIDs, nextHorizonNode)

		s.ResetVehicleWait(agvID)
		return TrafficDecision{
			Action:        DecisionReroute,
			Reason:        fmt.Sprintf("Wait exceeded %.1fs, rerouting to bypass locked node %s", s.waitThreshold, nextHorizonNode),
			SuggestedPath: suggestedNodeIDs,
		}
	}

	// Detour not found, fallback to wait
	return TrafficDecision{
		Action: DecisionWait,
		Reason: fmt.Sprintf("Detour search failed, waiting on %s locked by %s", nextHorizonNode, owner),
	}
}

// ---------------------------------------------------------------------
// TrafficStrategyManager (熱切換管理器)
// ---------------------------------------------------------------------
type TrafficStrategyManager struct {
	mu              sync.RWMutex
	currentStrategy ITrafficController
	strategies      map[string]ITrafficController
}

func NewTrafficStrategyManager() *TrafficStrategyManager {
	waitStrat := NewWaitTrafficStrategy()
	rerouteStrat := NewRerouteTrafficStrategy(3.0)

	mgr := &TrafficStrategyManager{
		currentStrategy: waitStrat,
		strategies: map[string]ITrafficController{
			"wait":    waitStrat,
			"reroute": rerouteStrat,
		},
	}
	return mgr
}

func (m *TrafficStrategyManager) GetCurrentStrategy() ITrafficController {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentStrategy
}

func (m *TrafficStrategyManager) SetStrategy(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	strat, exists := m.strategies[name]
	if !exists {
		return fmt.Errorf("unknown traffic strategy: %s (available: wait, reroute)", name)
	}

	m.currentStrategy = strat
	log.Printf("[TRAFFIC] Switched fleet traffic control strategy to: %s", strat.Name())
	return nil
}

func (m *TrafficStrategyManager) GetStrategyName() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentStrategy.Name()
}
