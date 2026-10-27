package model

import "time"

// Header is the standard VDA 5050 v2.1.0 message header
type Header struct {
	HeaderID       uint32    `json:"headerId"`
	Timestamp      time.Time `json:"timestamp"`
	Version        string    `json:"version"`
	Manufacturer   string    `json:"manufacturer"`
	SerialNumber   string    `json:"serialNumber"`
}

// NodePosition represents node coordinates in VDA 5050
type NodePosition struct {
	X                float64 `json:"x"`
	Y                float64 `json:"y"`
	Theta            float64 `json:"theta,omitempty"`
	MapID            string  `json:"mapId"`
	AllowedDeviationX float64 `json:"allowedDeviationX,omitempty"`
	AllowedDeviationY float64 `json:"allowedDeviationY,omitempty"`
}

// Action represents an action attached to a node or edge
type Action struct {
	ActionID          string `json:"actionId"`
	ActionType        string `json:"actionType"` // "pick", "drop", "charge", etc.
	ActionDescription string `json:"actionDescription,omitempty"`
	BlockingType      string `json:"blockingType"` // "NONE", "SOFT", "HARD"
}

// Node represents a node in the VDA 5050 Order
type Node struct {
	NodeID       string        `json:"nodeId"`
	SequenceID   uint32        `json:"sequenceId"`
	Released     bool          `json:"released"`
	NodePosition *NodePosition `json:"nodePosition,omitempty"`
	Actions      []Action      `json:"actions"`
}

// Edge represents an edge connecting two nodes in VDA 5050
type Edge struct {
	EdgeID      string   `json:"edgeId"`
	SequenceID  uint32   `json:"sequenceId"`
	Released    bool     `json:"released"`
	StartNodeID string   `json:"startNodeId"`
	EndNodeID   string   `json:"endNodeId"`
	Actions     []Action `json:"actions"`
}

// Order represents a VDA 5050 v2.1.0 Order message
type Order struct {
	Header
	OrderID       string `json:"orderId"`
	OrderUpdateID uint32 `json:"orderUpdateId"`
	ZoneSetID     string `json:"zoneSetId,omitempty"`
	Nodes         []Node `json:"nodes"`
	Edges         []Edge `json:"edges"`
}

// AGVPosition represents current position of AGV in VDA 5050 State
type AGVPosition struct {
	X                   float64 `json:"x"`
	Y                   float64 `json:"y"`
	Theta               float64 `json:"theta"`
	MapID               string  `json:"mapId"`
	PositionInitialized bool    `json:"positionInitialized"`
}

// Velocity represents AGV velocity vector in VDA 5050
type Velocity struct {
	Vx    float64 `json:"vx"`
	Vy    float64 `json:"vy"`
	Omega float64 `json:"omega"`
}

// BatteryState represents battery status in VDA 5050
type BatteryState struct {
	BatteryCharge float64 `json:"batteryCharge"` // 0.0 - 100.0
	Charging      bool    `json:"charging"`
}

// ActionState represents the status of an action
type ActionState struct {
	ActionID     string `json:"actionId"`
	ActionType   string `json:"actionType"`
	ActionStatus string `json:"actionStatus"` // "WAITING", "INITIALIZING", "RUNNING", "FINISHED", "FAILED"
}

// State represents a VDA 5050 v2.1.0 State message
type State struct {
	Header
	OrderID            string        `json:"orderId"`
	OrderUpdateID      uint32        `json:"orderUpdateId"`
	LastNodeID         string        `json:"lastNodeId"`
	LastNodeSequenceID uint32        `json:"lastNodeSequenceId"`
	NodeStates         []Node        `json:"nodeStates"`
	EdgeStates         []Edge        `json:"edgeStates"`
	AgvPosition        *AGVPosition  `json:"agvPosition,omitempty"`
	Velocity           *Velocity     `json:"velocity,omitempty"`
	BatteryState       BatteryState  `json:"batteryState"`
	OperatingMode      string        `json:"operatingMode"` // "AUTOMATIC", "MANUAL", "SEMIAUTOMATIC"
	ActionStates       []ActionState `json:"actionStates"`
	Errors             []interface{} `json:"errors"`
	Information        []interface{} `json:"information"`
	SafetyState        struct {
		EStop          string `json:"eStop"`
		FieldViolation bool   `json:"fieldViolation"`
	} `json:"safetyState"`
}
