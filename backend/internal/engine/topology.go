package engine

import "errors"

// TopologyNode represents a physical node in the factory layout
type TopologyNode struct {
	ID          string  `json:"id"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"` // Elevation
	Z           float64 `json:"z"` // Depth
	Function    string  `json:"function"`
	Description string  `json:"description"`
}

var FactoryMap = map[string]TopologyNode{
	"Node-01": {
		ID:          "Node-01",
		X:           0.0,
		Y:           0.0,
		Z:           0.0,
		Function:    "Idle/Charge",
		Description: "待命/充電區",
	},
	"Node-02": {
		ID:          "Node-02",
		X:           10.0,
		Y:           0.0,
		Z:           0.0,
		Function:    "Transit",
		Description: "路徑轉折點",
	},
	"Node-03": {
		ID:          "Node-03",
		X:           10.0,
		Y:           0.0,
		Z:           10.0,
		Function:    "Pick-up",
		Description: "取貨區",
	},
	"Node-04": {
		ID:          "Node-04",
		X:           0.0,
		Y:           0.0,
		Z:           10.0,
		Function:    "Drop-off",
		Description: "卸貨區",
	},
}

// RingSuccessor maps each node to its downstream connected node (one-way ring)
var RingSuccessor = map[string]string{
	"Node-01": "Node-02",
	"Node-02": "Node-03",
	"Node-03": "Node-04",
	"Node-04": "Node-01",
}

// CalculateRingPath returns the sequential list of nodes to traverse to reach targetNodeID
func CalculateRingPath(startNodeID, targetNodeID string) ([]TopologyNode, error) {
	if _, ok := FactoryMap[startNodeID]; !ok {
		return nil, errors.New("unknown start node: " + startNodeID)
	}
	if _, ok := FactoryMap[targetNodeID]; !ok {
		return nil, errors.New("unknown target node: " + targetNodeID)
	}

	if startNodeID == targetNodeID {
		return []TopologyNode{}, nil
	}

	var path []TopologyNode
	curr := startNodeID

	for i := 0; i < len(FactoryMap); i++ {
		nextID := RingSuccessor[curr]
		path = append(path, FactoryMap[nextID])
		if nextID == targetNodeID {
			return path, nil
		}
		curr = nextID
	}

	return nil, errors.New("target node not reachable in ring topology")
}
