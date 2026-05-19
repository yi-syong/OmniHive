package vehicle

import (
	"log"

	"github.com/yi-syong/OmniHive/internal/simulator/config"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

// ApplyOrder replaces the current path with a new VDA5050 Order.
func (v *Vehicle) ApplyOrder(order *vda5050.Order) {
	v.mu.Lock()
	defer v.mu.Unlock()

	v.CurrentOrderID = order.OrderID
	v.NodeStates = make([]vda5050.NodeState, len(order.Nodes))
	v.Waypoints = make([]config.Point, len(order.Nodes))
	v.EdgeStates = []vda5050.EdgeState{} // simplified

	for i, node := range order.Nodes {
		v.NodeStates[i] = vda5050.NodeState{
			NodeID:      node.NodeID,
			SequenceID:  node.SequenceID,
			Released:    false,
		}
		
		if node.NodePosition != nil {
			v.Waypoints[i] = config.Point{
				X: node.NodePosition.X,
				Y: node.NodePosition.Y,
			}
		}
	}

	v.CurrentWPIdx = 0
	if len(v.Waypoints) > 0 {
		v.Status = StatusDriving
		v.Driving = true
	}
	
	log.Printf("[%s] Received order %s with %d waypoints", v.SerialNumber, order.OrderID, len(v.Waypoints))
}

// ApplyAction applies a VDA5050 Action to the vehicle.
func (v *Vehicle) ApplyAction(action vda5050.Action) {
	v.mu.Lock()
	defer v.mu.Unlock()

	switch action.ActionType {
	case "initPosition":
		for _, p := range action.ActionParameters {
			if p.Key == "x" {
				if val, ok := p.Value.(float64); ok {
					v.X = val
				}
			} else if p.Key == "y" {
				if val, ok := p.Value.(float64); ok {
					v.Y = val
				}
			} else if p.Key == "theta" {
				if val, ok := p.Value.(float64); ok {
					v.Theta = val
				}
			} else if p.Key == "mapId" {
				if val, ok := p.Value.(string); ok {
					v.MapID = val
				}
			}
		}
		v.PositionInitialized = true
		log.Printf("[%s] initPosition: x=%.2f, y=%.2f, mapId=%s", v.SerialNumber, v.X, v.Y, v.MapID)
		
	case "cancelOrder":
		v.Status = StatusIdle
		v.Driving = false
		v.Speed = 0
		v.Waypoints = nil
		v.CurrentOrderID = ""
		v.NodeStates = nil
		v.EdgeStates = nil
		log.Printf("[%s] cancelOrder executed", v.SerialNumber)
		
	case "startPause":
		v.Paused = true
		v.Status = StatusPaused
		v.Speed = 0
		v.Driving = false
		log.Printf("[%s] startPause executed", v.SerialNumber)
		
	case "stopPause":
		v.Paused = false
		v.Status = StatusDriving // Resume driving
		log.Printf("[%s] stopPause executed", v.SerialNumber)
	}
}
