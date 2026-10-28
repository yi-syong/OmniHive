package engine

import (
	"testing"

	"omnihive/backend/internal/model"
)

func TestResourceRegistry(t *testing.T) {
	reg := NewResourceRegistry()

	// 1. Try lock node
	if !reg.TryLockNode("Node-01", "AGV-001") {
		t.Fatalf("expected AGV-001 to lock Node-01")
	}

	// Re-locking by same AGV should succeed
	if !reg.TryLockNode("Node-01", "AGV-001") {
		t.Fatalf("expected AGV-001 to retain lock on Node-01")
	}

	// Locking by another AGV should fail
	if reg.TryLockNode("Node-01", "AGV-002") {
		t.Fatalf("expected AGV-002 lock to fail on Node-01")
	}

	// Check status
	locked, owner := reg.IsNodeLocked("Node-01")
	if !locked || owner != "AGV-001" {
		t.Fatalf("expected Node-01 locked by AGV-001, got %v / %s", locked, owner)
	}

	// Unlock by other AGV should do nothing
	reg.UnlockNode("Node-01", "AGV-002")
	if locked, _ := reg.IsNodeLocked("Node-01"); !locked {
		t.Fatalf("expected Node-01 to remain locked")
	}

	// Unlock by owner
	reg.UnlockNode("Node-01", "AGV-001")
	if locked, _ := reg.IsNodeLocked("Node-01"); locked {
		t.Fatalf("expected Node-01 to be unlocked")
	}
}

func TestWaitTrafficStrategy(t *testing.T) {
	reg := NewResourceRegistry()
	strategy := NewWaitTrafficStrategy()

	// Node-02 is clear
	dec := strategy.EvaluateRelease("AGV-001", []string{"Node-01"}, []string{"Node-02", "Node-03"}, reg, nil)
	if dec.Action != DecisionReleaseNext {
		t.Fatalf("expected DecisionReleaseNext, got %v", dec.Action)
	}

	// Node-02 is locked by AGV-002
	reg.TryLockNode("Node-02", "AGV-002")
	dec2 := strategy.EvaluateRelease("AGV-001", []string{"Node-01"}, []string{"Node-02", "Node-03"}, reg, nil)
	if dec2.Action != DecisionWait {
		t.Fatalf("expected DecisionWait, got %v", dec2.Action)
	}
}

func TestRerouteTrafficStrategy(t *testing.T) {
	reg := NewResourceRegistry()
	strategy := NewRerouteTrafficStrategy(2.0)

	// Node-02 is locked by AGV-002
	reg.TryLockNode("Node-02", "AGV-002")

	// 1. Initial wait: wait time is 0 (< threshold 2.0s), should return DecisionWait
	dec1 := strategy.EvaluateRelease("AGV-001", []string{"Node-01"}, []string{"Node-02", "Node-03"}, reg, nil)
	if dec1.Action != DecisionWait {
		t.Fatalf("expected DecisionWait before threshold, got %v", dec1.Action)
	}

	// 2. Accumulate wait time past threshold
	strategy.RecordVehicleWait("AGV-001", 2.5)

	// Create a dummy layout with alternative path:
	// Node-01 -> Node-02 -> Node-03
	// Node-01 -> Node-04 -> Node-03 (alternative detour!)
	lm := &LayoutManager{
		nodeMap: map[string]model.LayoutNode{
			"Node-01": {ID: "Node-01", X: 0, Z: 0},
			"Node-02": {ID: "Node-02", X: 10, Z: 0},
			"Node-03": {ID: "Node-03", X: 20, Z: 0},
			"Node-04": {ID: "Node-04", X: 10, Z: 10},
		},
		adjList: map[string][]string{
			"Node-01": {"Node-02", "Node-04"},
			"Node-02": {"Node-03"},
			"Node-04": {"Node-03"},
		},
		edgeIdMap: map[string]string{
			"Node-01_Node-02": "Edge-1-2",
			"Node-02_Node-03": "Edge-2-3",
			"Node-01_Node-04": "Edge-1-4",
			"Node-04_Node-03": "Edge-4-3",
		},
	}

	dec2 := strategy.EvaluateRelease("AGV-001", []string{"Node-01"}, []string{"Node-02", "Node-03"}, reg, lm)
	if dec2.Action != DecisionReroute {
		t.Fatalf("expected DecisionReroute, got %v (%s)", dec2.Action, dec2.Reason)
	}

	if len(dec2.SuggestedPath) == 0 || dec2.SuggestedPath[0] != "Node-04" {
		t.Fatalf("expected detour via Node-04, got %v", dec2.SuggestedPath)
	}
}

func TestFleetManagerProgressiveRelease(t *testing.T) {
	lm := &LayoutManager{
		nodeMap: map[string]model.LayoutNode{
			"Node-01": {ID: "Node-01", X: 0, Z: 0},
			"Node-02": {ID: "Node-02", X: 5, Z: 0},
			"Node-03": {ID: "Node-03", X: 10, Z: 0},
			"Node-04": {ID: "Node-04", X: 15, Z: 0},
		},
		adjList: map[string][]string{
			"Node-01": {"Node-02"},
			"Node-02": {"Node-03"},
			"Node-03": {"Node-04"},
		},
		edgeIdMap: map[string]string{
			"Node-01_Node-02": "Edge-1-2",
			"Node-02_Node-03": "Edge-2-3",
			"Node-03_Node-04": "Edge-3-4",
		},
	}

	var publishedOrders []model.Order
	fm := NewFleetManager(
		lm,
		func(agvID string, order model.Order) {
			publishedOrders = append(publishedOrders, order)
		},
		nil,
	)

	// Dispatch mission from Node-01 to Node-04
	err := fm.DispatchMission("AGV-001", "Node-04", "none", nil)
	if err != nil {
		t.Fatalf("dispatch failed: %v", err)
	}

	if len(publishedOrders) == 0 {
		t.Fatalf("expected at least 1 order published")
	}

	firstOrder := publishedOrders[0]
	// First 2 nodes should be Base (released=true), remaining should be Horizon (released=false)
	if len(firstOrder.Nodes) != 3 {
		t.Fatalf("expected 3 waypoints (Node-02, Node-03, Node-04), got %d", len(firstOrder.Nodes))
	}

	if !firstOrder.Nodes[0].Released || !firstOrder.Nodes[1].Released {
		t.Fatalf("expected first 2 nodes to be released in Base")
	}

	if firstOrder.Nodes[2].Released {
		t.Fatalf("expected third node (Node-04) to be unreleased in Horizon")
	}
}
