package engine

import (
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"

	"omnihive/backend/internal/model"
)

// ActiveMission tracks the lifecycle of an ongoing VDA 5050 mission for an AGV.
type ActiveMission struct {
	OrderID           string
	OrderUpdateID     uint32
	AgvID             string
	BaselineDistance  float64
	ActualDistance    float64
	AllNodes          []model.Node
	ReleasedCount     int // Number of nodes currently in Base (Released = true)
	FinalAction       string
	StartNodeID       string
	DestinationNodeID string
	IsCompleted       bool
}

// FleetManager serves as the central VDA 5050 Fleet Traffic Master Controller.
// It manages path planning, dynamic Base/Horizon incremental release, resource locking,
// dynamic rerouting, and real-time A/B testing KPI aggregation.
type FleetManager struct {
	mu               sync.RWMutex
	registry         *ResourceRegistry
	strategyMgr      *TrafficStrategyManager
	metrics          *MetricsCollector
	layoutMgr        *LayoutManager
	activeMissions   map[string]*ActiveMission // agvID -> ActiveMission
	agvCurrentNodes  map[string]string         // agvID -> last known nodeID
	publishVDAOrder  func(agvID string, order model.Order)
	broadcastMetrics func(metrics FleetMetrics)
}

func NewFleetManager(
	layoutMgr *LayoutManager,
	publishVDAOrder func(agvID string, order model.Order),
	broadcastMetrics func(metrics FleetMetrics),
) *FleetManager {
	strategyMgr := NewTrafficStrategyManager()
	metrics := NewMetricsCollector(strategyMgr)
	registry := NewResourceRegistry()

	fm := &FleetManager{
		registry:         registry,
		strategyMgr:      strategyMgr,
		metrics:          metrics,
		layoutMgr:        layoutMgr,
		activeMissions:   make(map[string]*ActiveMission),
		agvCurrentNodes:  make(map[string]string),
		publishVDAOrder:  publishVDAOrder,
		broadcastMetrics: broadcastMetrics,
	}

	// Pre-lock default starting position for AGV-001
	fm.registry.TryLockNode("Node-01", "AGV-001")
	fm.agvCurrentNodes["AGV-001"] = "Node-01"

	return fm
}

// GetRegistry returns the active resource mutex registry.
func (fm *FleetManager) GetRegistry() *ResourceRegistry {
	return fm.registry
}

// GetStrategyManager returns the traffic strategy manager.
func (fm *FleetManager) GetStrategyManager() *TrafficStrategyManager {
	return fm.strategyMgr
}

// GetMetricsCollector returns the metrics collector.
func (fm *FleetManager) GetMetricsCollector() *MetricsCollector {
	return fm.metrics
}

// SetTrafficStrategy dynamically switches between "wait" and "reroute".
func (fm *FleetManager) SetTrafficStrategy(name string) error {
	err := fm.strategyMgr.SetStrategy(name)
	if err == nil {
		fm.broadcastCurrentMetrics()
	}
	return err
}

// DispatchMission creates and schedules a VDA 5050 order with progressive Base/Horizon releases.
func (fm *FleetManager) DispatchMission(agvID, targetNode, action string, steps []model.WsDispatchOrderItem) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	startNode := fm.agvCurrentNodes[agvID]
	if startNode == "" {
		startNode = "Node-01"
		fm.agvCurrentNodes[agvID] = startNode
	}

	var destinationNode string
	var finalAction string

	if len(steps) > 0 {
		lastStep := steps[len(steps)-1]
		destinationNode = lastStep.NodeID
		finalAction = lastStep.Action
	} else if targetNode != "" {
		destinationNode = targetNode
		finalAction = action
	} else {
		return fmt.Errorf("no target node specified in mission dispatch")
	}

	// Validate node function vs action compatibility (Charge vs Pick/Drop vs Transit/Wait)
	if destObj, ok := fm.layoutMgr.GetNode(destinationNode); ok {
		if (finalAction == "pick" || finalAction == "drop") && (destObj.Function == "Idle/Charge" || destObj.Function == "Wait" || destObj.Function == "Transit") {
			return fmt.Errorf("站點 %s (%s) 無法執行取放貨作業", destinationNode, destObj.Function)
		}
		if finalAction == "charge" && destObj.Function != "Idle/Charge" && destObj.Function != "Charge" {
			return fmt.Errorf("站點 %s (%s) 非充電站，無法執行充電作業", destinationNode, destObj.Function)
		}
	}

	for _, step := range steps {
		if stepObj, ok := fm.layoutMgr.GetNode(step.NodeID); ok {
			if (step.Action == "pick" || step.Action == "drop") && (stepObj.Function == "Idle/Charge" || stepObj.Function == "Wait" || stepObj.Function == "Transit") {
				return fmt.Errorf("中繼站點 %s (%s) 無法執行取放貨作業", step.NodeID, stepObj.Function)
			}
			if step.Action == "charge" && stepObj.Function != "Idle/Charge" && stepObj.Function != "Charge" {
				return fmt.Errorf("中繼站點 %s (%s) 非充電站，無法執行充電作業", step.NodeID, stepObj.Function)
			}
		}
	}

	// 1. Calculate optimal path from current node to destination
	waypoints, _, err := fm.layoutMgr.FindPath(startNode, destinationNode)
	if err != nil {
		return fmt.Errorf("path planning failed: %w", err)
	}

	// Calculate baseline distance
	baselineDist := 0.0
	prevX, prevZ := 0.0, 0.0
	if startObj, ok := fm.layoutMgr.GetNode(startNode); ok {
		prevX, prevZ = startObj.X, startObj.Z
	}
	for _, wp := range waypoints {
		dx := wp.X - prevX
		dz := wp.Z - prevZ
		baselineDist += math.Sqrt(dx*dx + dz*dz)
		prevX, prevZ = wp.X, wp.Z
	}

	orderID := fmt.Sprintf("ord-%s", uuid.New().String()[:8])
	now := time.Now().UTC()

	// 2. Build VDA 5050 Nodes with Base/Horizon partitioning
	// In v3: Initial Base releases the current node + immediate next node (first 1~2 nodes)
	vdaNodes := make([]model.Node, len(waypoints))
	initialReleasedCount := 0

	for i, wp := range waypoints {
		// Progressive release: first 1~2 nodes are Base (released=true), rest are Horizon (released=false)
		isBase := false
		if i == 0 {
			// First waypoint: attempt to lock immediately
			if fm.registry.TryLockNode(wp.ID, agvID) {
				isBase = true
				initialReleasedCount = 1
			} else {
				// Next node already locked by another vehicle! Start with 0 released -> force wait at current node
				isBase = false
			}
		} else if i == 1 && initialReleasedCount == 1 {
			// Try releasing second node as well for smooth cornering if available
			if fm.registry.TryLockNode(wp.ID, agvID) {
				isBase = true
				initialReleasedCount = 2
			}
		}

		actions := []model.Action{}
		if i == len(waypoints)-1 && finalAction != "" && finalAction != "none" {
			actions = append(actions, model.Action{
				ActionID:     fmt.Sprintf("act-%s", uuid.New().String()[:6]),
				ActionType:   finalAction,
				BlockingType: "HARD",
			})
		}

		vdaNodes[i] = model.Node{
			NodeID:     wp.ID,
			SequenceID: uint32((i + 1) * 2),
			Released:   isBase,
			NodePosition: &model.NodePosition{
				X:     wp.X,
				Y:     wp.Z, // VDA 5050 2D Y is 3D Z
				MapID: "factory-map-1",
			},
			Actions: actions,
		}
	}

	mission := &ActiveMission{
		OrderID:           orderID,
		OrderUpdateID:     0,
		AgvID:             agvID,
		BaselineDistance:  baselineDist,
		ActualDistance:    baselineDist,
		AllNodes:          vdaNodes,
		ReleasedCount:     initialReleasedCount,
		FinalAction:       finalAction,
		StartNodeID:       startNode,
		DestinationNodeID: destinationNode,
		IsCompleted:       false,
	}

	fm.activeMissions[agvID] = mission

	// 3. Publish initial VDA 5050 Order to AGV
	order := model.Order{
		Header: model.Header{
			HeaderID:     uint32(now.Unix()),
			Timestamp:    now,
			Version:      "2.1.0",
			Manufacturer: "OmniHive",
			SerialNumber: agvID,
		},
		OrderID:       orderID,
		OrderUpdateID: 0,
		Nodes:         vdaNodes,
		Edges:         []model.Edge{},
	}

	if fm.publishVDAOrder != nil {
		fm.publishVDAOrder(agvID, order)
	}

	log.Printf("[FLEET MASTER] Dispatched Order %s to %s (Base: %d nodes, Horizon: %d nodes, Total: %d)",
		orderID, agvID, initialReleasedCount, len(vdaNodes)-initialReleasedCount, len(vdaNodes))

	return nil
}

// OnVehicleTelemetry processes 10Hz kinematics and status updates from a vehicle.
// It manages node unlocks, progressive Base expansion, and detour injections.
func (fm *FleetManager) OnVehicleTelemetry(msg model.WsStateUpdateMessage) {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	agvID := msg.AgvID
	if agvID == "" {
		agvID = "AGV-001"
	}

	// Track vehicle traffic wait seconds in metrics
	if msg.TaskInfo.IsTrafficWait {
		fm.metrics.RecordWaitTick(0.1 * msg.TimeScale)
	}

	currNode := msg.TaskInfo.CurrentNode
	prevNode := fm.agvCurrentNodes[agvID]

	// 1. If vehicle moved to a new node, unlock previous node
	if currNode != "" && currNode != prevNode {
		if prevNode != "" {
			fm.registry.UnlockNode(prevNode, agvID)
			log.Printf("[FLEET REGISTRY] AGV %s arrived at %s; unlocked %s", agvID, currNode, prevNode)
		}
		fm.registry.TryLockNode(currNode, agvID)
		fm.agvCurrentNodes[agvID] = currNode
	}

	mission, hasMission := fm.activeMissions[agvID]
	if !hasMission || mission.IsCompleted {
		return
	}

	// 2. Check if mission reached final destination and is IDLE
	if currNode == mission.DestinationNodeID && msg.TaskInfo.Status == "IDLE" {
		mission.IsCompleted = true
		fm.metrics.RecordMissionCompleted(mission.BaselineDistance, mission.ActualDistance)
		fm.registry.ReleaseAllByAGV(agvID)
		delete(fm.activeMissions, agvID)
		log.Printf("[FLEET MASTER] Mission %s completed by %s! Throughput: %d",
			mission.OrderID, agvID, fm.metrics.throughput)
		fm.broadcastCurrentMetrics()
		return
	}

	// 3. Progressive Base Release & Traffic Strategy Evaluation
	// Find how many Base nodes remain in front of vehicle
	currIndex := -1
	for i, n := range mission.AllNodes {
		if n.NodeID == currNode {
			currIndex = i
			break
		}
	}

	// If vehicle is approaching the end of current Base (e.g. at or near the last released node)
	remainingBaseCount := mission.ReleasedCount - (currIndex + 1)
	hasHorizon := mission.ReleasedCount < len(mission.AllNodes)

	if hasHorizon && remainingBaseCount <= 1 {
		// Identify current Base tail and remaining Horizon nodes
		currentBaseIDs := make([]string, 0, mission.ReleasedCount)
		for i := 0; i < mission.ReleasedCount; i++ {
			currentBaseIDs = append(currentBaseIDs, mission.AllNodes[i].NodeID)
		}

		horizonIDs := make([]string, 0, len(mission.AllNodes)-mission.ReleasedCount)
		for i := mission.ReleasedCount; i < len(mission.AllNodes); i++ {
			horizonIDs = append(horizonIDs, mission.AllNodes[i].NodeID)
		}

		strategy := fm.strategyMgr.GetCurrentStrategy()
		decision := strategy.EvaluateRelease(agvID, currentBaseIDs, horizonIDs, fm.registry, fm.layoutMgr)

		switch decision.Action {
		case DecisionReleaseNext:
			// Lock next horizon node and promote to Base
			nextHorizonNode := horizonIDs[0]
			if fm.registry.TryLockNode(nextHorizonNode, agvID) {
				mission.AllNodes[mission.ReleasedCount].Released = true
				mission.ReleasedCount++
				mission.OrderUpdateID++

				now := time.Now().UTC()
				updateOrder := model.Order{
					Header: model.Header{
						HeaderID:     uint32(now.Unix()),
						Timestamp:    now,
						Version:      "2.1.0",
						Manufacturer: "OmniHive",
						SerialNumber: agvID,
					},
					OrderID:       mission.OrderID,
					OrderUpdateID: mission.OrderUpdateID,
					Nodes:         mission.AllNodes,
					Edges:         []model.Edge{},
				}

				if fm.publishVDAOrder != nil {
					fm.publishVDAOrder(agvID, updateOrder)
				}
				log.Printf("[FLEET MASTER] Released Node %s into Base for %s (UpdateID: %d)",
					nextHorizonNode, agvID, mission.OrderUpdateID)
			}

		case DecisionWait:
			// AGV must wait at Base terminus; strategy records wait
			strategy.RecordVehicleWait(agvID, 0.1*msg.TimeScale)

		case DecisionReroute:
			// Dynamic detour: replace unreleased horizon with suggested detour path
			if len(decision.SuggestedPath) > 0 {
				newNodes := make([]model.Node, 0, mission.ReleasedCount+len(decision.SuggestedPath))
				// Keep current Base
				for i := 0; i < mission.ReleasedCount; i++ {
					newNodes = append(newNodes, mission.AllNodes[i])
				}
				// Append detour waypoints
				for i, nodeID := range decision.SuggestedPath {
					nodeObj, _ := fm.layoutMgr.GetNode(nodeID)
					isFirstDetour := (i == 0)
					if isFirstDetour {
						fm.registry.TryLockNode(nodeID, agvID)
					}
					newNodes = append(newNodes, model.Node{
						NodeID:     nodeID,
						SequenceID: uint32((len(newNodes) + 1) * 2),
						Released:   isFirstDetour, // First detour node promoted to Base
						NodePosition: &model.NodePosition{
							X:     nodeObj.X,
							Y:     nodeObj.Z,
							MapID: "factory-map-1",
						},
						Actions: []model.Action{},
					})
				}

				mission.AllNodes = newNodes
				mission.ReleasedCount++
				mission.OrderUpdateID++

				// Compute extra distance incurred by detour
				detourDist := 0.0
				for _, n := range decision.SuggestedPath {
					if no, ok := fm.layoutMgr.GetNode(n); ok {
						detourDist += math.Sqrt(no.X*no.X + no.Z*no.Z)
					}
				}
				mission.ActualDistance += (detourDist * 0.25) // Add incremental distance factor

				now := time.Now().UTC()
				updateOrder := model.Order{
					Header: model.Header{
						HeaderID:     uint32(now.Unix()),
						Timestamp:    now,
						Version:      "2.1.0",
						Manufacturer: "OmniHive",
						SerialNumber: agvID,
					},
					OrderID:       mission.OrderID,
					OrderUpdateID: mission.OrderUpdateID,
					Nodes:         mission.AllNodes,
					Edges:         []model.Edge{},
				}

				if fm.publishVDAOrder != nil {
					fm.publishVDAOrder(agvID, updateOrder)
				}
				log.Printf("[FLEET MASTER] Injected dynamic detour order for %s (Nodes: %d, UpdateID: %d)",
					agvID, len(mission.AllNodes), mission.OrderUpdateID)
			}
		}
	}
}

func (fm *FleetManager) broadcastCurrentMetrics() {
	if fm.broadcastMetrics != nil {
		activeCount := len(fm.agvCurrentNodes)
		if activeCount == 0 {
			activeCount = 1
		}
		fm.broadcastMetrics(fm.metrics.GetMetrics(activeCount))
	}
}
