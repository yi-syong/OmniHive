package model

// WsPosition represents the 3D position and heading angle
type WsPosition struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"` // Height (elevation)
	Z     float64 `json:"z"` // 3D depth
	Theta float64 `json:"theta"`
}

// WsBattery represents battery metrics
type WsBattery struct {
	Level     float64 `json:"level"`
	Charging  bool    `json:"charging"`
	Mode      string  `json:"mode,omitempty"`       // "IDLE", "MOVING", "ACTING", "CC_CHARGING", "CV_CHARGING", "CHARGED"
	DrainRate float64 `json:"drain_rate,omitempty"` // Current %/s rate
}

// WsTaskInfo represents current mission execution state
type WsTaskInfo struct {
	Status         string `json:"status"` // "DRIVING", "ACTING", "IDLE"
	TargetNode     string `json:"target_node"`
	Action         string `json:"action"`
	DisplayMessage string `json:"display_message"`
	CurrentNode    string `json:"current_node,omitempty"`
	PreviousNode   string `json:"previous_node,omitempty"`
	HasCargo       bool   `json:"has_cargo"`
}

// WsStateUpdateMessage is broadcast from backend to frontend at 10Hz
type WsStateUpdateMessage struct {
	Type        string     `json:"type"` // "state_update"
	AgvID       string     `json:"agv_id"`
	Position    WsPosition `json:"position"`
	Velocity    float64    `json:"velocity"`
	Battery     WsBattery  `json:"battery"`
	TaskInfo    WsTaskInfo `json:"task_info"`
	VisualEvent string     `json:"visual_event,omitempty"` // "pick_done", "drop_done"
	TimeScale   float64    `json:"time_scale"`
	NodeStates  []string   `json:"node_states"`            // VDA 5050 active remaining node IDs
	EdgeStates  []string   `json:"edge_states"`            // VDA 5050 active remaining edge IDs
	PassedEdges []string   `json:"passed_edges,omitempty"` // Edges traversed in current mission
}

// WsDispatchOrderItem represents a single step in a multi-node task sequence
type WsDispatchOrderItem struct {
	NodeID string `json:"node_id"`
	Action string `json:"action"` // "none", "pick", "drop", "charge", "wait"
}

// WsDispatchOrderMessage is received from frontend to dispatch an order
type WsDispatchOrderMessage struct {
	Type       string                `json:"type"` // "dispatch_order"
	AgvID      string                `json:"agv_id"`
	TargetNode string                `json:"target_node,omitempty"`
	Action     string                `json:"action,omitempty"`
	Steps      []WsDispatchOrderItem `json:"steps,omitempty"` // Multi-node sequence
}

// WsSetTimeScaleMessage is received from frontend to change simulation time scale
type WsSetTimeScaleMessage struct {
	Type      string  `json:"type"` // "set_time_scale"
	TimeScale float64 `json:"time_scale"`
}
