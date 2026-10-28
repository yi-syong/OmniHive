package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"omnihive/backend/internal/engine"
	"omnihive/backend/internal/model"
	"omnihive/backend/internal/mqtt"
	"omnihive/backend/internal/ws"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mqttBroker := os.Getenv("MQTT_BROKER")
	if mqttBroker == "" {
		mqttBroker = "tcp://localhost:1883"
	}

	agvID := os.Getenv("AGV_ID")
	if agvID == "" {
		agvID = "AGV-001"
	}

	layoutFile := os.Getenv("LAYOUT_FILE")
	if layoutFile == "" {
		layoutFile = "factory_layout.json"
	}

	log.Printf("==================================================")
	log.Printf("   OmniHive Smart Factory - Fleet Manager Backend ")
	log.Printf("   Vehicle ID: %s | Port: %s | MQTT: %s", agvID, port, mqttBroker)
	log.Printf("   Layout Storage: %s", layoutFile)
	log.Printf("==================================================")

	// Initialize Factory Layout Manager with persistence
	layoutMgr, err := engine.NewLayoutManager(layoutFile)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize LayoutManager: %v", err)
	}

	// State caching for newly connected WebSocket clients
	var stateMu sync.RWMutex
	cachedStates := make(map[string]model.WsStateUpdateMessage)
	cachedState := model.WsStateUpdateMessage{
		Type:  "state_update",
		AgvID: agvID,
		Position: model.WsPosition{
			X:     0.0,
			Y:     0.0,
			Z:     0.0,
			Theta: 1.57,
		},
		Velocity: 0.0,
		Battery: model.WsBattery{
			Level:     95.0,
			Charging:  false,
			Mode:      "IDLE",
			DrainRate: 0.005,
		},
		TaskInfo: model.WsTaskInfo{
			Status:         "IDLE",
			TargetNode:     "Node-01",
			Action:         "none",
			DisplayMessage: "[待命] 系統就緒，等待任務派送",
			CurrentNode:    "Node-01",
			PreviousNode:   "Node-01",
			HasCargo:       false,
		},
		TimeScale:   1.0,
		NodeStates:  []string{},
		EdgeStates:  []string{},
		PassedEdges: []string{},
	}
	cachedStates[agvID] = cachedState

	var hub *ws.Hub
	var mqttBridge *mqtt.MqttBridge
	var fleetMgr *engine.FleetManager

	// Initialize Fleet Traffic Master Controller
	fleetMgr = engine.NewFleetManager(
		layoutMgr,
		func(targetAgvID string, order model.Order) {
			if mqttBridge != nil {
				_ = mqttBridge.PublishVDAOrder(targetAgvID, order)
			}
		},
		func(metrics engine.FleetMetrics) {
			if hub != nil {
				hub.BroadcastJSON(metrics)
			}
		},
	)

	// Callback when simulator publishes high-frequency 10Hz kinematics telemetry
	onTelemetryReceived := func(msg model.WsStateUpdateMessage) {
		stateMu.Lock()
		vehID := msg.AgvID
		if vehID == "" {
			vehID = agvID
		}
		cachedStates[vehID] = msg
		cachedState = msg
		stateMu.Unlock()

		if fleetMgr != nil {
			fleetMgr.OnVehicleTelemetry(msg)
		}

		if hub != nil {
			hub.BroadcastStateUpdate(msg)
		}
	}

	// Callback when simulator publishes standard 1Hz VDA 5050 state
	onVDA5050StateReceived := func(state model.State) {
		log.Printf("[VDA 5050 STATE] Vehicle %s: OrderID=%s, LastNode=%s, Mode=%s, Battery=%.1f%%",
			state.Header.SerialNumber, state.OrderID, state.LastNodeID, state.OperatingMode, state.BatteryState.BatteryCharge)
	}

	// Initialize MQTT Bridge (Fleet Dispatcher & Telemetry Subscriber)
	mqttBridge, err = mqtt.NewMqttBridge(mqttBroker, agvID, onTelemetryReceived, onVDA5050StateReceived)
	if err != nil {
		log.Printf("[MQTT WARNING] Failed to initialize MQTT bridge: %v (retrying in background)", err)
	} else {
		mqttBridge.SetNodeLookup(func(nodeID string) (float64, float64) {
			if n, ok := layoutMgr.GetNode(nodeID); ok {
				return n.X, n.Z
			}
			return 0, 0
		})
	}

	// Callback when WebSocket receives a dispatch_order from frontend
	onWsOrderReceived := func(msg model.WsDispatchOrderMessage) {
		targetAgv := msg.AgvID
		if targetAgv == "" {
			targetAgv = agvID
		}
		log.Printf("[DISPATCH] Dispatching mission to FleetManager: AGV=%s, Target=%s, Action=%s, Steps=%d",
			targetAgv, msg.TargetNode, msg.Action, len(msg.Steps))

		if err := fleetMgr.DispatchMission(targetAgv, msg.TargetNode, msg.Action, msg.Steps); err != nil {
			log.Printf("[DISPATCH ERROR] FleetManager dispatch failed: %v", err)
		}
	}

	// Callback when WebSocket receives a time scale change
	onWsTimeScaleReceived := func(scale float64) {
		log.Printf("[CONTROL] Setting simulation time scale to %.1fx via MQTT", scale)
		if mqttBridge != nil {
			_ = mqttBridge.PublishTimeScale(scale)
		}
	}

	// Initialize WebSocket Hub
	hub = ws.NewHub(onWsOrderReceived, onWsTimeScaleReceived, func() model.WsStateUpdateMessage {
		stateMu.RLock()
		defer stateMu.RUnlock()
		return cachedState
	})

	hub.SetInitialStatesProvider(func() []model.WsStateUpdateMessage {
		stateMu.RLock()
		defer stateMu.RUnlock()
		list := make([]model.WsStateUpdateMessage, 0, len(cachedStates))
		for _, s := range cachedStates {
			list = append(list, s)
		}
		return list
	})

	hub.SetStrategyCallback(func(strategy string) {
		log.Printf("[CONTROL] Setting traffic strategy to: %s", strategy)
		if fleetMgr != nil {
			_ = fleetMgr.SetTrafficStrategy(strategy)
		}
	})

	go hub.Run()

	// Broadcast A/B Testing Metrics periodically at 1Hz
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if fleetMgr != nil && hub != nil {
				stateMu.RLock()
				vCount := len(cachedStates)
				stateMu.RUnlock()
				if vCount == 0 {
					vCount = 1
				}
				metrics := fleetMgr.GetMetricsCollector().GetMetrics(vCount)
				hub.BroadcastJSON(metrics)
			}
		}
	}()

	// HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.HandleWebSocket)

	// GET & POST /api/layout for 3D Factory Layout Editor Persistence
	mux.HandleFunc("/api/layout", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			layout := layoutMgr.GetLayout()
			json.NewEncoder(w).Encode(layout)
			return
		}

		if r.Method == http.MethodPost {
			var newLayout model.FactoryLayout
			if err := json.NewDecoder(r.Body).Decode(&newLayout); err != nil {
				http.Error(w, fmt.Sprintf("invalid JSON layout: %v", err), http.StatusBadRequest)
				return
			}

			if err := layoutMgr.SaveLayout(newLayout); err != nil {
				http.Error(w, fmt.Sprintf("failed to save layout: %v", err), http.StatusInternalServerError)
				return
			}

			// Notify Vehicle Simulator to immediately reload layout graph
			if mqttBridge != nil {
				_ = mqttBridge.PublishLayoutReload()
				log.Printf("[LAYOUT] Published layout reload notification to vehicle simulator")
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"message": "Factory layout saved and synchronized with simulator",
				"version": newLayout.Version,
				"nodes":   len(newLayout.Nodes),
				"edges":   len(newLayout.Edges),
				"props":   len(newLayout.Props),
			})
			return
		}

		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	// GET /api/nodes for backward compatibility
	mux.HandleFunc("/api/nodes", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		layout := layoutMgr.GetLayout()
		json.NewEncoder(w).Encode(layout.Nodes)
	})

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		stateMu.RLock()
		cur := cachedState
		stateMu.RUnlock()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "UP",
			"prototype": 2,
			"agv":       cur,
			"mqtt":      mqttBroker,
		})
	})

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	go func() {
		log.Printf("[HTTP] WebSocket & REST server listening on http://0.0.0.0:%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[HTTP FATAL] ListenAndServe error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[SHUTDOWN] Shutting down OmniHive backend server...")
	if mqttBridge != nil {
		mqttBridge.Close()
	}
	server.Close()
	log.Println("[SHUTDOWN] OmniHive backend stopped cleanly.")
}
