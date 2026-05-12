// Package vda5050 provides type definitions and utilities for the VDA5050 v2.0
// communication interface between AGVs and a Master Control.
//
// Reference: https://github.com/VDA5050/VDA5050
package vda5050

import "time"

// --- Header ---

// Header contains common fields present in all VDA5050 messages.
type Header struct {
	// HeaderID is a unique identifier for the message, incremented per topic.
	HeaderID int64 `json:"headerId"`
	// Timestamp in ISO 8601 format (UTC).
	Timestamp string `json:"timestamp"`
	// Version of the VDA5050 protocol (e.g., "2.0.0").
	Version string `json:"version"`
	// Manufacturer of the AGV.
	Manufacturer string `json:"manufacturer"`
	// SerialNumber is the unique AGV serial number.
	SerialNumber string `json:"serialNumber"`
}

// NewHeader creates a new Header with the current timestamp.
func NewHeader(headerID int64, manufacturer, serialNumber string) Header {
	return Header{
		HeaderID:     headerID,
		Timestamp:    time.Now().UTC().Format(time.RFC3339Nano),
		Version:      ProtocolVersion,
		Manufacturer: manufacturer,
		SerialNumber: serialNumber,
	}
}

// --- State Message ---

// State is the main status message published by the AGV.
// Topic: <interface>/v2/<manufacturer>/<serialNumber>/state
type State struct {
	Header
	// OrderID of the current order (empty string if no order).
	OrderID string `json:"orderId"`
	// OrderUpdateID is the update counter of the current order.
	OrderUpdateID int64 `json:"orderUpdateId"`
	// LastNodeID is the ID of the last node the AGV traversed.
	LastNodeID string `json:"lastNodeId"`
	// LastNodeSequenceID is the sequence ID of the last traversed node.
	LastNodeSequenceID int64 `json:"lastNodeSequenceId"`
	// AGVPosition is the current position of the AGV on the map.
	AGVPosition *AGVPosition `json:"agvPosition,omitempty"`
	// Velocity of the AGV.
	Velocity *Velocity `json:"velocity,omitempty"`
	// BatteryState contains battery-related information.
	BatteryState BatteryState `json:"batteryState"`
	// OperatingMode of the AGV.
	OperatingMode OperatingMode `json:"operatingMode"`
	// Driving indicates whether the AGV is currently moving.
	Driving bool `json:"driving"`
	// Paused indicates whether the AGV is currently paused.
	Paused bool `json:"paused,omitempty"`
	// SafetyState contains safety-related information.
	SafetyState SafetyState `json:"safetyState"`
	// Errors is a list of current errors on the AGV.
	Errors []Error `json:"errors"`
	// Informations is a list of informational messages.
	Informations []Information `json:"informations,omitempty"`
	// NodeStates contains the states of the nodes in the current order.
	// Phase 3: Will be fully implemented with order handling.
	NodeStates []NodeState `json:"nodeStates"`
	// EdgeStates contains the states of the edges in the current order.
	// Phase 3: Will be fully implemented with order handling.
	EdgeStates []EdgeState `json:"edgeStates"`
	// ActionStates contains the states of the actions in the current order.
	// Phase 3: Will be fully implemented with order handling.
	ActionStates []ActionState `json:"actionStates"`
}

// --- Visualization Message ---

// Visualization is a high-frequency position update for visualization purposes.
// Topic: <interface>/v2/<manufacturer>/<serialNumber>/visualization
type Visualization struct {
	Header
	// AGVPosition is the current position of the AGV.
	AGVPosition *AGVPosition `json:"agvPosition,omitempty"`
	// Velocity of the AGV.
	Velocity *Velocity `json:"velocity,omitempty"`
}

// --- Connection Message ---

// Connection indicates the connection state of the AGV.
// Topic: <interface>/v2/<manufacturer>/<serialNumber>/connection
type Connection struct {
	Header
	// ConnectionState indicates the current connection state.
	ConnectionState ConnectionState `json:"connectionState"`
}

// --- Order Message (Phase 3) ---

// Order represents a transport order sent from Master Control to the AGV.
// Topic: <interface>/v2/<manufacturer>/<serialNumber>/order
type Order struct {
	Header
	OrderID       string `json:"orderId"`
	OrderUpdateID int64  `json:"orderUpdateId"`
	// Nodes and Edges will be fully implemented in Phase 3.
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// --- Sub-types ---

// AGVPosition represents the position of the AGV on the map.
type AGVPosition struct {
	// X coordinate in meters.
	X float64 `json:"x"`
	// Y coordinate in meters.
	Y float64 `json:"y"`
	// Theta is the orientation in radians (-Pi..Pi).
	Theta float64 `json:"theta"`
	// MapID is the identifier of the map.
	MapID string `json:"mapId"`
	// PositionInitialized indicates if the position is initialized.
	PositionInitialized bool `json:"positionInitialized"`
}

// Velocity represents the AGV's velocity.
type Velocity struct {
	// Vx is the velocity in x direction in m/s.
	Vx float64 `json:"vx,omitempty"`
	// Vy is the velocity in y direction in m/s.
	Vy float64 `json:"vy,omitempty"`
	// Omega is the rotational velocity in rad/s.
	Omega float64 `json:"omega,omitempty"`
}

// BatteryState contains battery information.
type BatteryState struct {
	// BatteryCharge is the state of charge in percent (0.0 - 100.0).
	BatteryCharge float64 `json:"batteryCharge"`
	// BatteryVoltage is the voltage in V.
	BatteryVoltage float64 `json:"batteryVoltage,omitempty"`
	// Charging indicates if the AGV is currently charging.
	Charging bool `json:"charging"`
	// Reach is the estimated reach in meters with current charge.
	Reach float64 `json:"reach,omitempty"`
}

// SafetyState contains safety information.
type SafetyState struct {
	// EStop indicates the e-stop state.
	EStop EStopState `json:"eStop"`
	// FieldViolation indicates if a protective field is violated.
	FieldViolation bool `json:"fieldViolation"`
}

// Error represents an AGV error.
type Error struct {
	// ErrorType is the type of the error.
	ErrorType string `json:"errorType,omitempty"`
	// ErrorLevel indicates the severity.
	ErrorLevel ErrorLevel `json:"errorLevel"`
	// ErrorDescription is a human-readable description.
	ErrorDescription string `json:"errorDescription,omitempty"`
	// ErrorReferences contains key-value pairs with additional information.
	ErrorReferences []ErrorReference `json:"errorReferences,omitempty"`
}

// ErrorReference contains additional information about an error.
type ErrorReference struct {
	ReferenceKey   string `json:"referenceKey"`
	ReferenceValue string `json:"referenceValue"`
}

// Information represents an informational message from the AGV.
type Information struct {
	InfoType        string `json:"infoType,omitempty"`
	InfoLevel       string `json:"infoLevel"`
	InfoDescription string `json:"infoDescription,omitempty"`
}

// --- Order Sub-types (Phase 3 stubs) ---

// NodeState represents the state of a node within an order.
type NodeState struct {
	NodeID       string `json:"nodeId"`
	SequenceID   int64  `json:"sequenceId"`
	NodePosition *AGVPosition `json:"nodePosition,omitempty"`
	Released     bool   `json:"released"`
}

// EdgeState represents the state of an edge within an order.
type EdgeState struct {
	EdgeID     string `json:"edgeId"`
	SequenceID int64  `json:"sequenceId"`
	Released   bool   `json:"released"`
}

// ActionState represents the state of an action within an order.
type ActionState struct {
	ActionID          string `json:"actionId"`
	ActionType        string `json:"actionType,omitempty"`
	ActionDescription string `json:"actionDescription,omitempty"`
	ActionStatus      string `json:"actionStatus"`
}

// Node represents a node in an order (Phase 3).
type Node struct {
	NodeID       string       `json:"nodeId"`
	SequenceID   int64        `json:"sequenceId"`
	Released     bool         `json:"released"`
	NodePosition *AGVPosition `json:"nodePosition,omitempty"`
	Actions      []Action     `json:"actions"`
}

// Edge represents an edge in an order (Phase 3).
type Edge struct {
	EdgeID        string  `json:"edgeId"`
	SequenceID    int64   `json:"sequenceId"`
	Released      bool    `json:"released"`
	StartNodeID   string  `json:"startNodeId"`
	EndNodeID     string  `json:"endNodeId"`
	MaxSpeed      float64 `json:"maxSpeed,omitempty"`
	Actions       []Action `json:"actions"`
}

// Action represents an action to be performed (Phase 3).
type Action struct {
	ActionID          string `json:"actionId"`
	ActionType        string `json:"actionType"`
	ActionDescription string `json:"actionDescription,omitempty"`
	BlockingType      string `json:"blockingType"`
}

// --- Enums ---

// OperatingMode represents the AGV's operating mode.
type OperatingMode string

const (
	OperatingModeAutomatic OperatingMode = "AUTOMATIC"
	OperatingModeSemiAuto  OperatingMode = "SEMIAUTOMATIC"
	OperatingModeManual    OperatingMode = "MANUAL"
	OperatingModeService   OperatingMode = "SERVICE"
	OperatingModeTeachIn   OperatingMode = "TEACHIN"
)

// ConnectionState represents the connection state.
type ConnectionState string

const (
	ConnectionOnline           ConnectionState = "ONLINE"
	ConnectionOffline          ConnectionState = "OFFLINE"
	ConnectionConnectionBroken ConnectionState = "CONNECTIONBROKEN"
)

// EStopState represents the emergency stop state.
type EStopState string

const (
	EStopAutoAck EStopState = "AUTOACK"
	EStopManual  EStopState = "MANUAL"
	EStopRemote  EStopState = "REMOTE"
	EStopNone    EStopState = "NONE"
)

// ErrorLevel represents the severity of an error.
type ErrorLevel string

const (
	ErrorLevelWarning ErrorLevel = "WARNING"
	ErrorLevelFatal   ErrorLevel = "FATAL"
)

// ProtocolVersion is the supported VDA5050 version.
const ProtocolVersion = "2.0.0"
