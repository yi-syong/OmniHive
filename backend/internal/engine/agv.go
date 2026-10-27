package engine

import (
	"context"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"omnihive/backend/internal/model"
)

type AGVStatus string

const (
	StatusIdle    AGVStatus = "IDLE"
	StatusDriving AGVStatus = "DRIVING"
	StatusActing  AGVStatus = "ACTING"
)

const (
	// Max speed 15 km/h = 4.17 m/s
	MaxSpeedMetric = 4.17
	MinSpeedMetric = 0.6
	TurnSpeedMetric = 1.2
	AccelRate      = 1.8 // m/s^2
	DecelRate      = 2.5 // m/s^2
	BaseTickDt     = 0.1 // 100ms
)

type AGVOrder struct {
	OrderID    string
	TargetNode string
	Action     string // "none", "pick", "drop", "charge"
}

type AGVEngine struct {
	mu sync.RWMutex

	id            string
	x             float64
	y             float64
	z             float64
	theta         float64
	currentSpeed  float64
	currentNode   string
	previousNode  string
	status        AGVStatus
	currentAction string
	targetNode    string
	displayMsg    string
	orderID       string
	visualEvent   string
	hasCargo      bool

	// Kinematics & Simulation parameters
	timeScale float64 // 1x, 5x, 10x, 20x

	// Battery engine
	battery *BatteryEngine

	// Dynamic VDA 5050 path tracking
	activeNodeStates []string
	activeEdgeStates []string
	passedEdges      []string

	// Layout and pathfinding manager
	layoutMgr *LayoutManager

	orderQueue    chan AGVOrder
	onWsBroadcast func(msg model.WsStateUpdateMessage)
	onMqttPublish func(state model.State)

	ctx    context.Context
	cancel context.CancelFunc
}

func NewAGVEngine(id string, layoutMgr *LayoutManager, onWsBroadcast func(model.WsStateUpdateMessage), onMqttPublish func(model.State)) *AGVEngine {
	ctx, cancel := context.WithCancel(context.Background())

	initX, initY, initZ := 0.0, 0.0, 0.0
	initNodeID := "Node-01"
	if node, ok := layoutMgr.GetNode("Node-01"); ok {
		initX, initY, initZ = node.X, node.Y, node.Z
	}

	return &AGVEngine{
		id:               id,
		x:                initX,
		y:                initY,
		z:                initZ,
		theta:            math.Pi / 2, // Facing +X initially
		currentSpeed:     0.0,
		currentNode:      initNodeID,
		previousNode:     initNodeID,
		status:           StatusIdle,
		currentAction:    "none",
		targetNode:       initNodeID,
		displayMsg:       "[待命] 系統就緒，停靠於 Node-01",
		orderID:          "INIT",
		visualEvent:      "",
		hasCargo:         false,
		timeScale:        1.0,
		battery:          NewBatteryEngine(95.0),
		activeNodeStates: []string{},
		activeEdgeStates: []string{},
		passedEdges:      []string{},
		layoutMgr:        layoutMgr,
		orderQueue:       make(chan AGVOrder, 10),
		onWsBroadcast:    onWsBroadcast,
		onMqttPublish:    onMqttPublish,
		ctx:              ctx,
		cancel:           cancel,
	}
}

func (e *AGVEngine) SetTimeScale(scale float64) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if scale < 1.0 {
		scale = 1.0
	} else if scale > 50.0 {
		scale = 50.0
	}
	e.timeScale = scale
	log.Printf("[Engine] Time scale set to %.1fx", scale)
}

func (e *AGVEngine) GetTimeScale() float64 {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.timeScale
}

func (e *AGVEngine) SubmitOrder(order AGVOrder) {
	select {
	case e.orderQueue <- order:
	default:
		// Queue full
	}
}

func (e *AGVEngine) Start() {
	go e.runOrderProcessor()
	go e.runKinematicsLoop()
	go e.runMqttStateLoop()
}

func (e *AGVEngine) Stop() {
	e.cancel()
}

func (e *AGVEngine) runOrderProcessor() {
	for {
		select {
		case <-e.ctx.Done():
			return
		case order := <-e.orderQueue:
			e.processOrder(order)
		}
	}
}

func (e *AGVEngine) processOrder(order AGVOrder) {
	e.mu.Lock()
	e.orderID = order.OrderID
	e.targetNode = order.TargetNode
	e.currentAction = order.Action
	startNode := e.currentNode

	actionDesc := mapActionName(order.Action)

	if startNode == order.TargetNode {
		// Already at target node, execute action directly
		e.activeNodeStates = []string{}
		e.activeEdgeStates = []string{}
		e.mu.Unlock()
		e.executeArrivalAction(order.Action, order.TargetNode)
		return
	}

	// Calculate shortest path via layout graph
	waypoints, edgeIDs, err := e.layoutMgr.FindPath(startNode, order.TargetNode)
	if err != nil {
		e.status = StatusIdle
		e.currentSpeed = 0
		e.displayMsg = fmt.Sprintf("[錯誤] 路徑計算失敗: %v", err)
		e.activeNodeStates = []string{}
		e.activeEdgeStates = []string{}
		e.mu.Unlock()
		e.triggerMqttPublish()
		return
	}

	// Initialize VDA 5050 active path states
	nodeStates := make([]string, len(waypoints))
	for i, wp := range waypoints {
		nodeStates[i] = wp.ID
	}
	e.activeNodeStates = nodeStates
	e.activeEdgeStates = append([]string{}, edgeIDs...)
	e.passedEdges = []string{}

	e.status = StatusDriving
	e.displayMsg = fmt.Sprintf("[行駛中] 前往 %s -> 預計執行: %s", order.TargetNode, actionDesc)
	e.mu.Unlock()

	e.triggerMqttPublish()

	// Traverse each waypoint in the path
	for i, wp := range waypoints {
		isFinalWaypoint := (i == len(waypoints)-1)
		edgeID := ""
		if i < len(edgeIDs) {
			edgeID = edgeIDs[i]
		}

		e.navigateToWaypoint(wp, isFinalWaypoint, edgeID)
		if e.ctx.Err() != nil {
			return
		}
	}

	// Arrived at final destination node
	e.executeArrivalAction(order.Action, order.TargetNode)
}

func (e *AGVEngine) navigateToWaypoint(wp model.LayoutNode, isFinal bool, edgeID string) {
	ticker := time.NewTicker(100 * time.Millisecond) // 10Hz ticker
	defer ticker.Stop()

	targetX := wp.X
	targetZ := wp.Z

	for {
		select {
		case <-e.ctx.Done():
			return
		case <-ticker.C:
			e.mu.Lock()
			scale := e.timeScale
			dt := BaseTickDt * scale

			dx := targetX - e.x
			dz := targetZ - e.z
			dist := math.Sqrt(dx*dx + dz*dz)

			// Target speed: TurnSpeed for mid-waypoints, 0 for final target
			targetSpeedAtWaypoint := TurnSpeedMetric
			if isFinal {
				targetSpeedAtWaypoint = 0.0
			}

			// Deceleration distance to reach targetSpeedAtWaypoint: d = (v^2 - v_t^2)/(2*a)
			decelDist := 0.0
			if e.currentSpeed > targetSpeedAtWaypoint {
				decelDist = (e.currentSpeed*e.currentSpeed - targetSpeedAtWaypoint*targetSpeedAtWaypoint) / (2.0 * DecelRate)
			}

			// Adjust velocity with acceleration/deceleration
			if dist <= decelDist+0.2 {
				// Braking zone
				e.currentSpeed -= DecelRate * dt
				if isFinal {
					if e.currentSpeed < MinSpeedMetric {
						e.currentSpeed = MinSpeedMetric
					}
				} else {
					if e.currentSpeed < TurnSpeedMetric {
						e.currentSpeed = TurnSpeedMetric
					}
				}
			} else {
				// Acceleration zone up to MaxSpeed (4.17 m/s)
				if e.currentSpeed < MaxSpeedMetric {
					e.currentSpeed += AccelRate * dt
					if e.currentSpeed > MaxSpeedMetric {
						e.currentSpeed = MaxSpeedMetric
					}
				}
			}

			step := e.currentSpeed * dt

			// Turn heading towards waypoint (Babylon.js Y-rotation: atan2(dx, dz))
			e.theta = math.Atan2(dx, dz)

			// Step towards waypoint
			if dist <= step {
				// Reached waypoint!
				e.x = targetX
				e.z = targetZ
				e.previousNode = e.currentNode
				e.currentNode = wp.ID

				// Prune VDA 5050 nodeStates and edgeStates dynamically
				if len(e.activeNodeStates) > 0 && e.activeNodeStates[0] == wp.ID {
					e.activeNodeStates = e.activeNodeStates[1:]
				}
				if len(e.activeEdgeStates) > 0 {
					passedEdge := e.activeEdgeStates[0]
					e.activeEdgeStates = e.activeEdgeStates[1:]
					e.passedEdges = append(e.passedEdges, passedEdge)
				} else if edgeID != "" {
					e.passedEdges = append(e.passedEdges, edgeID)
				}

				if isFinal {
					e.currentSpeed = 0.0
				}

				e.mu.Unlock()
				e.triggerMqttPublish()
				return
			}

			ratio := step / dist
			e.x += dx * ratio
			e.z += dz * ratio
			e.mu.Unlock()
		}
	}
}

func (e *AGVEngine) executeArrivalAction(action string, targetNode string) {
	e.mu.Lock()
	e.currentSpeed = 0
	e.currentNode = targetNode
	scale := e.timeScale
	e.mu.Unlock()

	if action == "" || action == "none" {
		e.mu.Lock()
		e.status = StatusIdle
		e.displayMsg = fmt.Sprintf("[待命] 已到達 %s，等待下一指令", targetNode)
		e.activeNodeStates = []string{}
		e.activeEdgeStates = []string{}
		e.passedEdges = []string{}
		e.mu.Unlock()
		e.triggerMqttPublish()
		return
	}

	actionDesc := mapActionName(action)
	e.mu.Lock()
	e.status = StatusActing
	e.displayMsg = fmt.Sprintf("[執行動作中] 正在%s...", actionDesc)
	e.mu.Unlock()
	e.triggerMqttPublish()

	// Action duration is 3.0s / timeScale
	baseDuration := 3.0
	actualDuration := time.Duration(float64(time.Second) * (baseDuration / scale))
	if actualDuration < 50*time.Millisecond {
		actualDuration = 50 * time.Millisecond
	}

	// For charging, we simulate progressive charging during the duration
	if action == "charge" {
		ticker := time.NewTicker(100 * time.Millisecond)
		timer := time.NewTimer(actualDuration)
		defer ticker.Stop()
		defer timer.Stop()

	chargeLoop:
		for {
			select {
			case <-e.ctx.Done():
				return
			case <-timer.C:
				break chargeLoop
			case <-ticker.C:
				e.mu.Lock()
				dt := BaseTickDt * e.timeScale
				e.battery.Update(StatusActing, "charge", 0, MaxSpeedMetric, e.hasCargo, true, dt)
				lvl, _, _, _ := e.battery.GetStatus()
				e.displayMsg = fmt.Sprintf("[充電中] 電量: %.1f%%", lvl)
				e.mu.Unlock()
			}
		}
	} else {
		// Pick or Drop action wait
		select {
		case <-e.ctx.Done():
			return
		case <-time.After(actualDuration):
		}
	}

	e.mu.Lock()
	var visualEvent string
	switch action {
	case "pick":
		visualEvent = "pick_done"
		e.hasCargo = true
		e.displayMsg = fmt.Sprintf("[待命] 已完成取貨，貨物裝載完成，停靠於 %s", targetNode)
	case "drop":
		visualEvent = "drop_done"
		e.hasCargo = false
		e.displayMsg = fmt.Sprintf("[待命] 已完成卸貨，貨物輸送入庫，停靠於 %s", targetNode)
	case "charge":
		visualEvent = ""
		e.battery.SetLevel(100.0)
		e.displayMsg = fmt.Sprintf("[待命] 充電完成 (100%%)，停靠於 %s", targetNode)
	case "wait":
		visualEvent = ""
		e.displayMsg = fmt.Sprintf("[待命] 已完成原地等待，停靠於 %s", targetNode)
	default:
		e.displayMsg = fmt.Sprintf("[待命] 動作 %s 完成", action)
	}

	e.visualEvent = visualEvent
	e.status = StatusIdle
	e.activeNodeStates = []string{}
	e.activeEdgeStates = []string{}
	e.passedEdges = []string{}
	e.mu.Unlock()

	e.triggerMqttPublish()

	// Clear visual event after scaled interval so frontend only triggers once
	eventClearTime := time.Duration(float64(time.Millisecond) * (300.0 / math.Max(1.0, scale)))
	if eventClearTime < 50*time.Millisecond {
		eventClearTime = 50 * time.Millisecond
	}
	time.Sleep(eventClearTime)

	e.mu.Lock()
	e.visualEvent = ""
	e.mu.Unlock()
}

func (e *AGVEngine) runKinematicsLoop() {
	ticker := time.NewTicker(100 * time.Millisecond) // 10Hz
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			return
		case <-ticker.C:
			e.mu.Lock()
			dt := BaseTickDt * e.timeScale
			// Update battery
			isChargingNow := (e.status == StatusActing && e.currentAction == "charge")
			e.battery.Update(e.status, e.currentAction, e.currentSpeed, MaxSpeedMetric, e.hasCargo, isChargingNow, dt)
			e.mu.Unlock()

			msg := e.GetWsStateUpdateMessage()
			if e.onWsBroadcast != nil {
				e.onWsBroadcast(msg)
			}
		}
	}
}

func (e *AGVEngine) runMqttStateLoop() {
	ticker := time.NewTicker(1000 * time.Millisecond) // 1Hz low frequency
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			return
		case <-ticker.C:
			e.triggerMqttPublish()
		}
	}
}

func (e *AGVEngine) triggerMqttPublish() {
	if e.onMqttPublish != nil {
		e.onMqttPublish(e.GetVDA5050State())
	}
}

func (e *AGVEngine) GetWsStateUpdateMessage() model.WsStateUpdateMessage {
	e.mu.RLock()
	defer e.mu.RUnlock()

	batLvl, batCharging, batMode, batRate := e.battery.GetStatus()

	return model.WsStateUpdateMessage{
		Type:  "state_update",
		AgvID: e.id,
		Position: model.WsPosition{
			X:     roundFloat(e.x, 2),
			Y:     roundFloat(e.y, 2),
			Z:     roundFloat(e.z, 2),
			Theta: roundFloat(e.theta, 3),
		},
		Velocity: roundFloat(e.currentSpeed, 2),
		Battery: model.WsBattery{
			Level:     roundFloat(batLvl, 1),
			Charging:  batCharging,
			Mode:      batMode,
			DrainRate: roundFloat(batRate, 3),
		},
		TaskInfo: model.WsTaskInfo{
			Status:         string(e.status),
			TargetNode:     e.targetNode,
			Action:         e.currentAction,
			DisplayMessage: e.displayMsg,
			CurrentNode:    e.currentNode,
			PreviousNode:   e.previousNode,
			HasCargo:       e.hasCargo,
		},
		VisualEvent: e.visualEvent,
		TimeScale:   e.timeScale,
		NodeStates:  append([]string{}, e.activeNodeStates...),
		EdgeStates:  append([]string{}, e.activeEdgeStates...),
		PassedEdges: append([]string{}, e.passedEdges...),
	}
}

func (e *AGVEngine) GetVDA5050State() model.State {
	e.mu.RLock()
	defer e.mu.RUnlock()

	now := time.Now().UTC()
	batLvl, batCharging, _, _ := e.battery.GetStatus()

	// Build VDA 5050 NodeStates and EdgeStates from dynamic active path
	var vdaNodeStates []model.Node
	for idx, nodeID := range e.activeNodeStates {
		nPos := &model.NodePosition{
			MapID: "factory-map-1",
		}
		if n, ok := e.layoutMgr.GetNode(nodeID); ok {
			nPos.X = n.X
			nPos.Y = n.Z // VDA 5050 2D planar Y is our 3D Z
		}
		vdaNodeStates = append(vdaNodeStates, model.Node{
			NodeID:       nodeID,
			SequenceID:   uint32(idx + 1),
			Released:     true,
			NodePosition: nPos,
			Actions:      []model.Action{},
		})
	}

	var vdaEdgeStates []model.Edge
	for idx, edgeID := range e.activeEdgeStates {
		vdaEdgeStates = append(vdaEdgeStates, model.Edge{
			EdgeID:     edgeID,
			SequenceID: uint32(idx + 1),
			Released:   true,
			Actions:    []model.Action{},
		})
	}

	return model.State{
		Header: model.Header{
			HeaderID:     uint32(now.Unix()),
			Timestamp:    now,
			Version:      "2.1.0",
			Manufacturer: "OmniHive",
			SerialNumber: e.id,
		},
		OrderID:            e.orderID,
		OrderUpdateID:      0,
		LastNodeID:         e.currentNode,
		LastNodeSequenceID: 0,
		NodeStates:         vdaNodeStates,
		EdgeStates:         vdaEdgeStates,
		AgvPosition: &model.AGVPosition{
			X:                   roundFloat(e.x, 2),
			Y:                   roundFloat(e.z, 2), // VDA 5050 2D planar Y is our 3D Z
			Theta:               roundFloat(e.theta, 3),
			MapID:               "factory-map-1",
			PositionInitialized: true,
		},
		Velocity: &model.Velocity{
			Vx:    roundFloat(e.currentSpeed*math.Cos(e.theta), 2),
			Vy:    roundFloat(e.currentSpeed*math.Sin(e.theta), 2),
			Omega: 0.0,
		},
		BatteryState: model.BatteryState{
			BatteryCharge: roundFloat(batLvl, 1),
			Charging:      batCharging,
		},
		OperatingMode: "AUTOMATIC",
		ActionStates: []model.ActionState{
			{
				ActionID:     "act-current",
				ActionType:   e.currentAction,
				ActionStatus: string(e.status),
			},
		},
		Errors:      []interface{}{},
		Information: []interface{}{},
	}
}

func mapActionName(action string) string {
	switch action {
	case "pick":
		return "取貨"
	case "drop":
		return "卸貨"
	case "charge":
		return "充電"
	case "wait":
		return "原地等待"
	case "none", "":
		return "無動作"
	default:
		return action
	}
}

func roundFloat(val float64, precision int) float64 {
	p := math.Pow(10, float64(precision))
	return math.Round(val*p) / p
}
