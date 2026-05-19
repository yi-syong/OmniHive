package vehicle

import (
	"testing"

	"github.com/yi-syong/OmniHive/internal/simulator/config"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

func TestSimulatorApplyAction(t *testing.T) {
	v := NewVehicle(1, "TestMaker", config.VehicleConfig{Speed: 1.0, BatteryCapacity: 100}, []config.Point{}, "test-map")
	
	// Default state
	if v.Status != StatusIdle {
		t.Errorf("Expected initial status IDLE, got %s", v.Status)
	}
	
	// Apply an order
	order := &vda5050.Order{
		OrderID: "order123",
		Nodes: []vda5050.Node{
			{NodeID: "n1", NodePosition: &vda5050.AGVPosition{X: 10, Y: 10}},
			{NodeID: "n2", NodePosition: &vda5050.AGVPosition{X: 20, Y: 20}},
		},
	}
	v.ApplyOrder(order)
	
	if v.Status != StatusDriving {
		t.Errorf("Expected status DRIVING after order, got %s", v.Status)
	}
	if v.CurrentOrderID != "order123" {
		t.Errorf("Expected orderID order123, got %s", v.CurrentOrderID)
	}
	
	// Test Pause
	pauseAction := vda5050.Action{ActionType: "startPause"}
	v.ApplyAction(pauseAction)
	if v.Status != StatusPaused {
		t.Errorf("Expected status PAUSED, got %s", v.Status)
	}
	if !v.Paused {
		t.Errorf("Expected Paused=true")
	}
	
	// Test Resume
	resumeAction := vda5050.Action{ActionType: "stopPause"}
	v.ApplyAction(resumeAction)
	if v.Status != StatusDriving {
		t.Errorf("Expected status DRIVING after resume, got %s", v.Status)
	}
	
	// Test Cancel
	cancelAction := vda5050.Action{ActionType: "cancelOrder"}
	v.ApplyAction(cancelAction)
	if v.Status != StatusIdle {
		t.Errorf("Expected status IDLE after cancel, got %s", v.Status)
	}
	if v.CurrentOrderID != "" {
		t.Errorf("Expected orderID to be cleared, got %s", v.CurrentOrderID)
	}
	if len(v.Waypoints) != 0 {
		t.Errorf("Expected waypoints to be cleared")
	}
}
