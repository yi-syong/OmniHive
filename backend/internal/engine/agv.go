package engine

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
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

// AGVWaypoint represents an intermediate or destination node in a VDA 5050 order.
type AGVWaypoint struct {
	NodeID   string
	X        float64
	Z        float64
	Released bool // true = Base (authorized), false = Horizon (unauthorized reservation)
	Action   string
}

// VehiclePose represents real-time position and state of a fleet AGV for collision avoidance
type VehiclePose struct {
	ID       string  `json:"id"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Z        float64 `json:"z"`
	Theta    float64 `json:"theta"`
	Speed    float64 `json:"speed"`
	NodeID   string  `json:"node_id"`
	HasCargo bool    `json:"has_cargo"`
}

type FleetPoseProvider func(selfID string) []VehiclePose

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

	// Fleet collision avoidance
	fleetProvider FleetPoseProvider

	// VDA 5050 Base / Horizon & Traffic Control State
	currentOrderUpdateID uint32
	orderWaypoints       []AGVWaypoint
	isTrafficWaiting     bool
	trafficWaitSeconds   float64
	orderUpdateNotify    chan struct{}
	vdaOrderQueue        chan model.Order

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

	orderCtxMu         sync.Mutex
	currentOrderCtx    context.Context
	currentOrderCancel context.CancelFunc

	orderQueue    chan AGVOrder
	onWsBroadcast func(msg model.WsStateUpdateMessage)
	onMqttPublish func(state model.State)

	ctx    context.Context
	cancel context.CancelFunc
}

func NewAGVEngine(id string, layoutMgr *LayoutManager, onWsBroadcast func(model.WsStateUpdateMessage), onMqttPublish func(model.State)) *AGVEngine {
	ctx, cancel := context.WithCancel(context.Background())
	orderCtx, orderCancel := context.WithCancel(ctx)

	initX, initY, initZ := 0.0, 0.0, 0.0
	initNodeID := "Node-01"
	if node, ok := layoutMgr.GetNode("Node-01"); ok {
		initX, initY, initZ = node.X, node.Y, node.Z
	}

	return &AGVEngine{
		id:                   id,
		x:                    initX,
		y:                    initY,
		z:                    initZ,
		theta:                math.Pi / 2, // Facing +X initially
		currentSpeed:         0.0,
		currentNode:          initNodeID,
		previousNode:         initNodeID,
		status:               StatusIdle,
		currentAction:        "none",
		targetNode:           initNodeID,
		displayMsg:           "[待命] 系統就緒，停靠於 Node-01",
		orderID:              "INIT",
		currentOrderUpdateID: 0,
		orderWaypoints:       []AGVWaypoint{},
		isTrafficWaiting:     false,
		trafficWaitSeconds:   0.0,
		orderUpdateNotify:    make(chan struct{}, 10),
		vdaOrderQueue:        make(chan model.Order, 10),
		visualEvent:          "",
		hasCargo:             false,
		timeScale:            1.0,
		battery:              NewBatteryEngine(95.0),
		activeNodeStates:     []string{},
		activeEdgeStates:     []string{},
		passedEdges:          []string{},
		layoutMgr:            layoutMgr,
		currentOrderCtx:      orderCtx,
		currentOrderCancel:   orderCancel,
		orderQueue:           make(chan AGVOrder, 10),
		onWsBroadcast:        onWsBroadcast,
		onMqttPublish:        onMqttPublish,
		ctx:                  ctx,
		cancel:               cancel,
	}
}
// SetInitialNode positions the AGV at a specific factory layout node
func (e *AGVEngine) SetInitialNode(nodeID string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if node, ok := e.layoutMgr.GetNode(nodeID); ok {
		e.x = node.X
		e.y = node.Y
		e.z = node.Z
		e.currentNode = nodeID
		e.previousNode = nodeID
		e.targetNode = nodeID
		e.displayMsg = fmt.Sprintf("[待命] 系統就緒，停靠於 %s", nodeID)
		log.Printf("[Engine %s] Initial node set to %s (%.2f, %.2f, %.2f)", e.id, nodeID, e.x, e.y, e.z)
	}
}

// SetFleetPoseProvider configures the fleet position callback for dynamic inter-vehicle collision avoidance
func (e *AGVEngine) SetFleetPoseProvider(provider FleetPoseProvider) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.fleetProvider = provider
}

// GetPose returns current kinematics pose of this vehicle
func (e *AGVEngine) GetPose() VehiclePose {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return VehiclePose{
		ID:       e.id,
		X:        e.x,
		Y:        e.y,
		Z:        e.z,
		Theta:    e.theta,
		Speed:    e.currentSpeed,
		NodeID:   e.currentNode,
		HasCargo: e.hasCargo,
	}
}

func normalizeAngle(rad float64) float64 {
	for rad > math.Pi {
		rad -= 2 * math.Pi
	}
	for rad < -math.Pi {
		rad += 2 * math.Pi
	}
	return rad
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

// AbortCurrentOrder immediately interrupts any ongoing motion, clears waypoint goals, and reverts vehicle to IDLE.
func (e *AGVEngine) AbortCurrentOrder(reason string) {
	e.orderCtxMu.Lock()
	if e.currentOrderCancel != nil {
		e.currentOrderCancel()
	}
	e.currentOrderCtx, e.currentOrderCancel = context.WithCancel(e.ctx)
	e.orderCtxMu.Unlock()

	e.mu.Lock()
	e.orderWaypoints = nil
	e.activeNodeStates = nil
	e.activeEdgeStates = nil
	e.passedEdges = nil
	e.currentSpeed = 0.0
	e.status = StatusIdle
	e.isTrafficWaiting = false
	e.trafficWaitSeconds = 0.0
	e.targetNode = e.currentNode
	e.currentAction = "none"
	e.displayMsg = fmt.Sprintf("[任務中止] %s", reason)
	e.mu.Unlock()

	// Drain any pending orders in vdaOrderQueue
	for {
		select {
		case <-e.vdaOrderQueue:
		default:
			goto drained
		}
	}
drained:

	// Wake up any waiting loops
	select {
	case e.orderUpdateNotify <- struct{}{}:
	default:
	}

	e.triggerMqttPublish()
	log.Printf("[Engine %s] AbortCurrentOrder executed: %s", e.id, reason)
}

// ResetVehicleState resets vehicle state and optionally repositions to a given node.
func (e *AGVEngine) ResetVehicleState(nodeID string) {
	e.AbortCurrentOrder("系統路權重設")
	e.mu.Lock()
	defer e.mu.Unlock()

	targetNode := nodeID
	if targetNode == "" {
		targetNode = e.currentNode
	}
	if node, ok := e.layoutMgr.GetNode(targetNode); ok {
		e.x = node.X
		e.y = node.Y
		e.z = node.Z
		e.currentNode = targetNode
		e.previousNode = targetNode
		e.targetNode = targetNode
		e.displayMsg = fmt.Sprintf("[待命] 系統就緒，停靠於 %s", targetNode)
	}
	e.triggerMqttPublish()
	log.Printf("[Engine %s] ResetVehicleState completed at node %s", e.id, targetNode)
}

// SubmitVDAOrder submits or updates a VDA 5050 Order with Base/Horizon releases
func (e *AGVEngine) SubmitVDAOrder(order model.Order) {
	// If order has no nodes, treat as order cancellation
	if len(order.Nodes) == 0 {
		e.AbortCurrentOrder("收到取消訂單 (Empty Nodes)")
		return
	}

	e.mu.Lock()
	if e.orderID == order.OrderID && order.OrderUpdateID > e.currentOrderUpdateID {
		e.currentOrderUpdateID = order.OrderUpdateID
		// In-place update of waypoint release flags
		for _, vNode := range order.Nodes {
			for idx := range e.orderWaypoints {
				if e.orderWaypoints[idx].NodeID == vNode.NodeID {
					e.orderWaypoints[idx].Released = vNode.Released
				}
			}
		}
		log.Printf("[AGV %s] Applied VDA OrderUpdate %d for Order %s (Nodes: %d)",
			e.id, order.OrderUpdateID, order.OrderID, len(order.Nodes))
		e.mu.Unlock()

		// Wake up any traffic waiting loop
		select {
		case e.orderUpdateNotify <- struct{}{}:
		default:
		}
		return
	}

	// New order: if currently driving or traffic waiting, preempt previous order
	isBusy := (e.status == StatusDriving || e.isTrafficWaiting)
	e.mu.Unlock()

	if isBusy {
		log.Printf("[AGV %s] Preempting current order for new Order %s", e.id, order.OrderID)
		e.orderCtxMu.Lock()
		if e.currentOrderCancel != nil {
			e.currentOrderCancel()
		}
		e.orderCtxMu.Unlock()
	}

	select {
	case e.vdaOrderQueue <- order:
	default:
		// Drain older queued order if full
		select {
		case <-e.vdaOrderQueue:
		default:
		}
		e.vdaOrderQueue <- order
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
		case vdaOrder := <-e.vdaOrderQueue:
			e.processVDAOrder(vdaOrder)
		}
	}
}

func (e *AGVEngine) processOrder(order AGVOrder) {
	vdaOrder := model.Order{
		OrderID:       order.OrderID,
		OrderUpdateID: 0,
		Nodes: []model.Node{
			{
				NodeID:   order.TargetNode,
				Released: true, // Legacy order: full base release
				Actions: []model.Action{
					{
						ActionType: order.Action,
					},
				},
			},
		},
	}
	e.processVDAOrder(vdaOrder)
}

func (e *AGVEngine) processVDAOrder(order model.Order) {
	e.orderCtxMu.Lock()
	if e.currentOrderCancel != nil {
		e.currentOrderCancel()
	}
	orderCtx, orderCancel := context.WithCancel(e.ctx)
	e.currentOrderCtx = orderCtx
	e.currentOrderCancel = orderCancel
	e.orderCtxMu.Unlock()

	e.mu.Lock()
	e.orderID = order.OrderID
	e.currentOrderUpdateID = order.OrderUpdateID
	startNode := e.currentNode

	var finalAction string
	var finalTarget string
	if len(order.Nodes) > 0 {
		lastNode := order.Nodes[len(order.Nodes)-1]
		finalTarget = lastNode.NodeID
		if len(lastNode.Actions) > 0 {
			finalAction = lastNode.Actions[0].ActionType
		}
	}
	e.targetNode = finalTarget
	e.currentAction = finalAction
	actionDesc := mapActionName(finalAction)

	if startNode == finalTarget && len(order.Nodes) <= 1 {
		e.activeNodeStates = []string{}
		e.activeEdgeStates = []string{}
		e.mu.Unlock()
		e.executeArrivalAction(finalAction, finalTarget)
		return
	}

	// Build waypoints from order.Nodes
	var waypoints []AGVWaypoint
	var nodeStates []string

	for _, n := range order.Nodes {
		if n.NodeID == startNode && len(order.Nodes) > 1 {
			// Skip starting node if it's the current position
			continue
		}
		var posX, posZ float64
		if n.NodePosition != nil && (n.NodePosition.X != 0 || n.NodePosition.Y != 0) {
			posX = n.NodePosition.X
			posZ = n.NodePosition.Y
		} else if nodeObj, ok := e.layoutMgr.GetNode(n.NodeID); ok {
			posX = nodeObj.X
			posZ = nodeObj.Z
		}
		act := "none"
		if len(n.Actions) > 0 {
			act = n.Actions[0].ActionType
		}
		waypoints = append(waypoints, AGVWaypoint{
			NodeID:   n.NodeID,
			X:        posX,
			Z:        posZ,
			Released: n.Released,
			Action:   act,
		})
		nodeStates = append(nodeStates, n.NodeID)
	}

	// If order only specified final target node, expand via layoutMgr
	if len(waypoints) == 0 || (len(waypoints) == 1 && waypoints[0].NodeID == finalTarget) {
		fullWps, _, err := e.layoutMgr.FindPath(startNode, finalTarget)
		if err == nil && len(fullWps) > 0 {
			waypoints = make([]AGVWaypoint, len(fullWps))
			nodeStates = make([]string, len(fullWps))
			for i, w := range fullWps {
				rel := true
				if i > 0 && len(order.Nodes) > 0 && !order.Nodes[0].Released {
					rel = false
				}
				act := "none"
				if i == len(fullWps)-1 {
					act = finalAction
				}
				waypoints[i] = AGVWaypoint{
					NodeID:   w.ID,
					X:        w.X,
					Z:        w.Z,
					Released: rel,
					Action:   act,
				}
				nodeStates[i] = w.ID
			}
		}
	}

	// Build complete edge sequence connecting all consecutive nodes from startNode through all waypoints
	var activeEdges []string
	currTrackingNode := startNode
	for _, wp := range waypoints {
		if edgeID, ok := e.layoutMgr.GetEdgeBetween(currTrackingNode, wp.NodeID); ok {
			activeEdges = append(activeEdges, edgeID)
		} else {
			_, subEdges, err := e.layoutMgr.FindPath(currTrackingNode, wp.NodeID)
			if err == nil && len(subEdges) > 0 {
				activeEdges = append(activeEdges, subEdges...)
			} else {
				activeEdges = append(activeEdges, fmt.Sprintf("Edge-%s-%s", currTrackingNode, wp.NodeID))
			}
		}
		currTrackingNode = wp.NodeID
	}
	e.activeEdgeStates = activeEdges

	e.orderWaypoints = waypoints
	e.activeNodeStates = nodeStates
	e.passedEdges = []string{}
	e.status = StatusDriving
	e.isTrafficWaiting = false
	e.displayMsg = fmt.Sprintf("[行駛中] 前往 %s -> 預計執行: %s", finalTarget, actionDesc)
	e.mu.Unlock()
	e.triggerMqttPublish()

	for i, wp := range waypoints {
		if orderCtx.Err() != nil {
			return
		}
		isFinal := (i == len(waypoints) - 1)
		edgeID := ""
		if i < len(e.activeEdgeStates) {
			edgeID = e.activeEdgeStates[i]
		}
		e.navigateToWaypoint(orderCtx, wp, isFinal, edgeID)
		if orderCtx.Err() != nil || e.ctx.Err() != nil {
			return
		}
	}

	if orderCtx.Err() != nil {
		return
	}

	e.executeArrivalAction(finalAction, finalTarget)
}

func (e *AGVEngine) navigateToWaypoint(orderCtx context.Context, wp AGVWaypoint, isFinal bool, edgeID string) {
	// 1. Ensure waypoint is released (Base) before entering!
	for {
		if orderCtx.Err() != nil {
			return
		}
		e.mu.RLock()
		released := wp.Released
		for _, item := range e.orderWaypoints {
			if item.NodeID == wp.NodeID {
				released = item.Released
				break
			}
		}
		e.mu.RUnlock()

		if released {
			e.mu.Lock()
			e.isTrafficWaiting = false
			e.status = StatusDriving
			e.mu.Unlock()
			break
		}

		// Node is in Horizon (unauthorized) -> Safe braking & Traffic Wait
		e.mu.Lock()
		e.currentSpeed = 0.0
		e.isTrafficWaiting = true
		e.displayMsg = fmt.Sprintf("[交管等待] 等待前方 %s 路權釋放 (Horizon -> Base)...", wp.NodeID)
		scale := e.timeScale
		e.mu.Unlock()
		e.triggerMqttPublish()

		select {
		case <-orderCtx.Done():
			return
		case <-e.ctx.Done():
			return
		case <-e.orderUpdateNotify:
			// Woken up by new order update, loop re-evaluates released status
		case <-time.After(100 * time.Millisecond):
			e.mu.Lock()
			e.trafficWaitSeconds += (0.1 * scale)
			e.mu.Unlock()
		}
	}

	// 2. Kinematics motion loop towards waypoint
	ticker := time.NewTicker(100 * time.Millisecond) // 10Hz ticker
	defer ticker.Stop()

	targetX := wp.X
	targetZ := wp.Z
	isDockingAction := isFinal && (wp.Action == "pick" || wp.Action == "drop")

	// If docking at cargo station, stop at safe standoff (1.25m in front of pallet)
	if isDockingAction {
		dx0 := wp.X - e.x
		dz0 := wp.Z - e.z
		d0 := math.Hypot(dx0, dz0)
		if d0 > 0.01 {
			ux := dx0 / d0
			uz := dz0 / d0
			standoff := 1.25
			targetX = wp.X - standoff*ux
			targetZ = wp.Z - standoff*uz
		}
	}

	for {
		select {
		case <-orderCtx.Done():
			return
		case <-e.ctx.Done():
			return
		case <-ticker.C:
			e.mu.Lock()
			scale := e.timeScale
			dt := BaseTickDt * scale

			// Inter-vehicle collision avoidance (fleet proximity field ~1.8m)
			fp := e.fleetProvider
			if fp != nil {
				poses := fp(e.id)
				tooClose := false
				var conflictID string
				var conflictDist float64

				for _, other := range poses {
					d := math.Hypot(other.X-e.x, other.Z-e.z)
					if d < 1.8 {
						// Deterministic collision avoidance without mutual deadlock:
						// 1. If other is parked directly at our waypoint node -> yield.
						// 2. If other is stopped and at our current node -> yield.
						// 3. If both are active, strict alphanumeric priority: larger ID yields to smaller ID.
						// (Never yield solely on other.Speed == 0 when other is active, because other may have stopped to yield to us!)
						if other.NodeID == wp.NodeID || (other.Speed == 0 && other.NodeID == e.currentNode) || e.id > other.ID {
							tooClose = true
							conflictID = other.ID
							conflictDist = d
							break
						}
					}
				}

				if tooClose {
					e.currentSpeed = 0.0
					e.isTrafficWaiting = true
					e.displayMsg = fmt.Sprintf("[交管防撞] 偵測到車輛 %s (間距 %.1fm < 1.8m)，安全避讓減速中...", conflictID, conflictDist)
					e.mu.Unlock()
					e.triggerMqttPublish()
					continue
				} else if e.isTrafficWaiting && strings.HasPrefix(e.displayMsg, "[交管防撞]") {
					e.isTrafficWaiting = false
					e.displayMsg = fmt.Sprintf("[行駛中] 前方路況淨空，恢復前往 %s", wp.NodeID)
				}
			}

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

			// Determine maximum allowable speed:
			// - If laden with cargo: cap at 1.25 m/s to prevent throwing cargo off
			// - If approaching docking action: cap at 0.60 m/s creep speed
			maxAllowedSpeed := MaxSpeedMetric
			if e.hasCargo {
				maxAllowedSpeed = 1.25
			}
			if isDockingAction && dist < 2.5 {
				if maxAllowedSpeed > 0.60 {
					maxAllowedSpeed = 0.60
				}
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
				if e.currentSpeed < maxAllowedSpeed {
					e.currentSpeed += AccelRate * dt
					if e.currentSpeed > maxAllowedSpeed {
						e.currentSpeed = maxAllowedSpeed
					}
				} else if e.currentSpeed > maxAllowedSpeed {
					e.currentSpeed -= DecelRate * dt
					if e.currentSpeed < maxAllowedSpeed {
						e.currentSpeed = maxAllowedSpeed
					}
				}
			}

			step := e.currentSpeed * dt

			// Travel direction:
			// - Normal cruising between waypoints: chassis leads forward, forks trail behind in the rear!
			// - Final docking approach to pick/drop: forks turn forward to face station pallet!
			if isDockingAction {
				if targetNode, ok := e.layoutMgr.GetNode(wp.NodeID); ok && (targetNode.Function == "Cargo" || targetNode.Function == "Pick-up" || targetNode.Function == "Drop-off") {
					e.theta = normalizeAngle(targetNode.RotationY)
				} else {
					e.theta = normalizeAngle(math.Atan2(wp.X-e.x, wp.Z-e.z))
				}
			} else {
				e.theta = normalizeAngle(math.Atan2(dx, dz) + math.Pi)
			}

			// Step towards waypoint
			if dist <= step {
				// Reached waypoint!
				e.x = targetX
				e.z = targetZ
				e.previousNode = e.currentNode
				e.currentNode = wp.NodeID

				// Prune VDA 5050 nodeStates and edgeStates dynamically
				if len(e.activeNodeStates) > 0 && e.activeNodeStates[0] == wp.NodeID {
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

	var currNodeX, currNodeZ, prevNodeX, prevNodeZ float64
	hasNodePos := false
	var targetNodeObj *model.LayoutNode
	if currNode, ok := e.layoutMgr.GetNode(targetNode); ok {
		currNodeX = currNode.X
		currNodeZ = currNode.Z
		hasNodePos = true
		targetNodeObj = &currNode
	}
	if e.previousNode != "" {
		if prevNode, ok := e.layoutMgr.GetNode(e.previousNode); ok {
			prevNodeX = prevNode.X
			prevNodeZ = prevNode.Z
		}
	} else if hasNodePos {
		prevNodeX = e.x
		prevNodeZ = e.z
	}

	// Calculate docking approach unit vector (from approach path into pallet)
	dx := currNodeX - prevNodeX
	dz := currNodeZ - prevNodeZ
	dLen := math.Hypot(dx, dz)
	ux := 0.0
	uz := 1.0
	if dLen > 0.01 {
		ux = dx / dLen
		uz = dz / dLen
	}

	if action == "pick" || action == "drop" {
		// If station is a cargo node with pallet orientation, align docking vector with pallet angle!
		if targetNodeObj != nil && (targetNodeObj.Function == "Cargo" || targetNodeObj.Function == "Pick-up" || targetNodeObj.Function == "Drop-off") {
			rot := targetNodeObj.RotationY
			ux = math.Sin(rot)
			uz = math.Cos(rot)
			e.theta = normalizeAngle(rot)
		} else {
			e.theta = normalizeAngle(math.Atan2(ux, uz))
		}
	}
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
	if action == "pick" {
		e.visualEvent = "pick_start"
	} else if action == "drop" {
		e.visualEvent = "drop_start"
	}
	e.mu.Unlock()
	e.triggerMqttPublish()

	baseDuration := 3.6
	if action == "charge" {
		baseDuration = 8.0
	}
	actualDuration := time.Duration(float64(time.Second) * (baseDuration / scale))
	if actualDuration < 50*time.Millisecond {
		actualDuration = 50 * time.Millisecond
	}

	startTime := time.Now()
	ticker := time.NewTicker(60 * time.Millisecond)
	timer := time.NewTimer(actualDuration)
	defer ticker.Stop()
	defer timer.Stop()

actionLoop:
	for {
		select {
		case <-e.ctx.Done():
			return
		case <-timer.C:
			break actionLoop
		case <-ticker.C:
			elapsed := time.Since(startTime)
			progress := float64(elapsed) / float64(actualDuration)
			if progress > 1.0 {
				progress = 1.0
			}

			if action == "charge" {
				e.mu.Lock()
				lvl, _, _, _ := e.battery.GetStatus()
				e.displayMsg = fmt.Sprintf("[充電中] 電量: %.1f%%", lvl)
				e.mu.Unlock()
			} else if (action == "pick" || action == "drop") && hasNodePos {
				e.mu.Lock()
				// 3-Phase Forklift Docking Kinematics:
				// Phase 1 (0.00 ~ 0.35): Creep forward to slide lowered forks into pallet bottom
				// Phase 2 (0.35 ~ 0.65): Lift / lower fork carriage with cargo
				// Phase 3 (0.65 ~ 1.00): Creep backward out of pallet back to standoff
				if progress <= 0.35 {
					p := progress / 0.35
					offset := 1.25 - 0.45*p // from 1.25m to 0.80m
					e.x = currNodeX - offset*ux
					e.z = currNodeZ - offset*uz
					e.displayMsg = fmt.Sprintf("[執行動作中] 牙叉從底部伸入棧板 (進叉)...")
				} else if progress <= 0.65 {
					offset := 0.80
					e.x = currNodeX - offset*ux
					e.z = currNodeZ - offset*uz
					if action == "pick" {
						e.displayMsg = fmt.Sprintf("[執行動作中] 牙叉升起，抬起貨物...")
					} else {
						e.displayMsg = fmt.Sprintf("[執行動作中] 牙叉下降，貨物就位...")
					}
				} else {
					p := (progress - 0.65) / 0.35
					offset := 0.80 + 0.45*p // from 0.80m back to 1.25m
					e.x = currNodeX - offset*ux
					e.z = currNodeZ - offset*uz
					e.displayMsg = fmt.Sprintf("[執行動作中] 牙叉退出棧板 (退叉完畢)...")
				}
				e.mu.Unlock()
				e.triggerMqttPublish()
			}
		}
	}

	e.mu.Lock()
	var visualEvent string
	switch action {
	case "pick":
		visualEvent = "pick_done"
		e.hasCargo = true
		e.displayMsg = fmt.Sprintf("[待命] 已完成取貨，貨物裝載完成，停靠於 %s", targetNode)
		if e.layoutMgr != nil {
			e.layoutMgr.SetNodeCargo(targetNode, false)
		}
	case "drop":
		visualEvent = "drop_done"
		e.hasCargo = false
		e.displayMsg = fmt.Sprintf("[待命] 已完成卸貨，貨物輸送入庫，停靠於 %s", targetNode)
		if e.layoutMgr != nil {
			e.layoutMgr.SetNodeCargo(targetNode, true)
		}
	case "charge":
		visualEvent = ""
		lvl, _, _, _ := e.battery.GetStatus()
		if lvl >= 100.0 {
			e.displayMsg = fmt.Sprintf("[待命] 充電完成 (100.0%%)，停靠於 %s", targetNode)
		} else {
			e.displayMsg = fmt.Sprintf("[待命] 充電結束 (目前電量: %.1f%%)，停靠於 %s", lvl, targetNode)
		}
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
			// Update battery: charges when executing "charge" action OR when parked at Node-01 charging station
			isChargingNow := (e.status == StatusActing && e.currentAction == "charge") ||
				(e.status == StatusIdle && e.currentNode == "Node-01")
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
			IsTrafficWait:  e.isTrafficWaiting,
			WaitSeconds:    roundFloat(e.trafficWaitSeconds, 1),
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
