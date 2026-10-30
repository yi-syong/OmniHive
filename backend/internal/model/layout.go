package model

// LayoutNode represents a topological node in the factory layout
type LayoutNode struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Z           float64 `json:"z"`
	Function    string  `json:"function"`    // "Idle/Charge", "Transit", "Pick-up", "Drop-off", "Cargo"
	Description string  `json:"description"`
	HasCargo    bool    `json:"has_cargo"`
	RotationY   float64 `json:"rotationY,omitempty"` // Heading angle around Y axis (in radians)
}

// LayoutEdge represents a directional or bidirectional path connecting two nodes
type LayoutEdge struct {
	ID            string `json:"id"`
	StartNodeID   string `json:"startNodeId"`
	EndNodeID     string `json:"endNodeId"`
	Bidirectional bool   `json:"bidirectional,omitempty"` // true if AGV can travel in both directions
}

// LayoutProp represents a static 3D obstacle, rack, or station prop
type LayoutProp struct {
	ID        string  `json:"id"`
	ModelType string  `json:"modelType"` // "rack", "push_back", "pallet", "box", "workstation", "pillar"
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Z         float64 `json:"z"`
	RotationY float64 `json:"rotationY"`
	Scale     float64 `json:"scale"`
}

// FactoryLayout represents the entire factory floor configuration
type FactoryLayout struct {
	Version string       `json:"version"`
	Nodes   []LayoutNode `json:"nodes"`
	Edges   []LayoutEdge `json:"edges"`
	Props   []LayoutProp `json:"props"`
}
