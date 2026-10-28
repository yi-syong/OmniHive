package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"

	"omnihive/backend/internal/engine"
	"omnihive/backend/internal/model"
)

type AddVehiclePayload struct {
	AgvID       string `json:"agv_id"`
	InitialNode string `json:"initial_node"`
}

func main() {
	mqttBroker := os.Getenv("MQTT_BROKER")
	if mqttBroker == "" {
		mqttBroker = "tcp://localhost:1883"
	}

	layoutFile := os.Getenv("LAYOUT_FILE")
	if layoutFile == "" {
		layoutFile = "factory_layout.json"
	}

	// Support multiple vehicle IDs in a single simulator instance (e.g. AGV_IDS=AGV-001,AGV-002)
	agvIDsStr := os.Getenv("AGV_IDS")
	if agvIDsStr == "" {
		agvIDsStr = os.Getenv("AGV_ID")
		if agvIDsStr == "" {
			agvIDsStr = "AGV-001,AGV-002"
		}
	}

	rawIDs := strings.Split(agvIDsStr, ",")
	var initialAgvIDs []string
	for _, id := range rawIDs {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" {
			initialAgvIDs = append(initialAgvIDs, trimmed)
		}
	}
	if len(initialAgvIDs) == 0 {
		initialAgvIDs = []string{"AGV-001"}
	}

	timeScaleTopic := "omnihive/control/time_scale"
	layoutReloadTopic := "omnihive/layout/reload"
	addVehicleTopic := "omnihive/control/add_vehicle"

	log.Printf("==================================================")
	log.Printf("   OmniHive Multi-AGV Behavior Fleet Simulator    ")
	log.Printf("   Active Vehicles: %v | Broker: %s", initialAgvIDs, mqttBroker)
	log.Printf("   Layout Storage:  %s", layoutFile)
	log.Printf("==================================================")

	// Load factory layout
	layoutMgr, err := engine.NewLayoutManager(layoutFile)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize LayoutManager: %v", err)
	}

	var mqttClient paho.Client
	var mu sync.RWMutex
	engines := make(map[string]*engine.AGVEngine)

	createEngine := func(id string, initNode string) *engine.AGVEngine {
		idLower := strings.ToLower(id)
		telemetryTopic := fmt.Sprintf("omnihive/telemetry/%s", idLower)
		stateTopic := fmt.Sprintf("vda5050/v2.1.0/%s/state", idLower)

		onMotionBroadcast := func(msg model.WsStateUpdateMessage) {
			if mqttClient != nil && mqttClient.IsConnected() {
				data, err := json.Marshal(msg)
				if err == nil {
					_ = mqttClient.Publish(telemetryTopic, 0, false, data)
				}
			}
		}

		onVDA5050StatePublish := func(state model.State) {
			if mqttClient != nil && mqttClient.IsConnected() {
				data, err := json.Marshal(state)
				if err == nil {
					_ = mqttClient.Publish(stateTopic, 1, false, data)
				}
			}
		}

		eng := engine.NewAGVEngine(id, layoutMgr, onMotionBroadcast, onVDA5050StatePublish)
		if initNode == "" {
			if strings.EqualFold(id, "AGV-002") {
				initNode = "Node-04"
			} else {
				initNode = "Node-01"
			}
		}
		eng.SetInitialNode(initNode)

		eng.SetFleetPoseProvider(func(selfID string) []engine.VehiclePose {
			mu.RLock()
			defer mu.RUnlock()
			var poses []engine.VehiclePose
			for otherID, otherEng := range engines {
				if strings.EqualFold(otherID, selfID) {
					continue
				}
				poses = append(poses, otherEng.GetPose())
			}
			return poses
		})

		return eng
	}

	// Initialize defined engines
	for _, id := range initialAgvIDs {
		initNode := os.Getenv("INITIAL_NODE")
		if initNode != "" && len(initialAgvIDs) == 1 {
			engines[id] = createEngine(id, initNode)
		} else {
			engines[id] = createEngine(id, "")
		}
	}

	// MQTT Client configuration
	opts := paho.NewClientOptions()
	opts.AddBroker(mqttBroker)
	opts.SetClientID(fmt.Sprintf("omnihive-fleet-sim-%d", time.Now().UnixNano()))
	opts.SetKeepAlive(60 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(5 * time.Second)

	opts.SetOnConnectHandler(func(c paho.Client) {
		log.Printf("[MQTT] Fleet Simulator connected to broker: %s", mqttBroker)

		// 1. Wildcard subscription to VDA 5050 Order topic for all vehicles
		token := c.Subscribe("vda5050/v2.1.0/+/order", 1, func(_ paho.Client, m paho.Message) {
			topicParts := strings.Split(m.Topic(), "/")
			if len(topicParts) < 4 {
				return
			}
			targetIdLower := topicParts[2]

			var order model.Order
			if err := json.Unmarshal(m.Payload(), &order); err != nil {
				log.Printf("[ERROR] Failed to unmarshal VDA 5050 order: %v", err)
				return
			}
			if len(order.Nodes) == 0 {
				log.Printf("[WARNING] Order contains no nodes")
				return
			}

			mu.RLock()
			var targetEngine *engine.AGVEngine
			for id, eng := range engines {
				if strings.EqualFold(id, targetIdLower) {
					targetEngine = eng
					break
				}
			}
			mu.RUnlock()

			if targetEngine != nil {
				log.Printf("[SIMULATOR] Dispatching VDA 5050 Order %s (Nodes: %d) to vehicle %s",
					order.OrderID, len(order.Nodes), targetIdLower)
				targetEngine.SubmitVDAOrder(order)
			} else {
				log.Printf("[WARNING] Received order for unknown vehicle: %s", targetIdLower)
			}
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to order wildcard: %v", token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to wildcard VDA 5050 order topic: vda5050/v2.1.0/+/order")
		}

		// 2. Subscribe to Time Scale Control topic
		token = c.Subscribe(timeScaleTopic, 0, func(_ paho.Client, m paho.Message) {
			valStr := strings.TrimSpace(string(m.Payload()))
			scale, err := strconv.ParseFloat(valStr, 64)
			if err != nil {
				return
			}
			log.Printf("[SIMULATOR] Updating simulation time scale to: %.1fx across fleet", scale)
			mu.RLock()
			for _, eng := range engines {
				eng.SetTimeScale(scale)
			}
			mu.RUnlock()
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", timeScaleTopic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to Time Scale topic: %s", timeScaleTopic)
		}

		// 3. Subscribe to Layout Reload topic
		token = c.Subscribe(layoutReloadTopic, 1, func(_ paho.Client, m paho.Message) {
			log.Printf("[SIMULATOR] Layout reload signal received")
			if err := layoutMgr.ReloadFromFile(); err != nil {
				log.Printf("[SIMULATOR ERROR] Failed to reload layout: %v", err)
			} else {
				log.Printf("[SIMULATOR] Layout successfully reloaded across all vehicles")
			}
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", layoutReloadTopic, token.Error())
		}

		// 4. Subscribe to Dynamic Vehicle Registration topic (for future on-the-fly vehicle creation)
		token = c.Subscribe(addVehicleTopic, 1, func(_ paho.Client, m paho.Message) {
			var payload AddVehiclePayload
			if err := json.Unmarshal(m.Payload(), &payload); err != nil {
				log.Printf("[SIMULATOR WARNING] Invalid add_vehicle payload: %v", err)
				return
			}
			newID := strings.TrimSpace(payload.AgvID)
			if newID == "" {
				return
			}

			mu.Lock()
			if _, exists := engines[newID]; !exists {
				eng := createEngine(newID, payload.InitialNode)
				engines[newID] = eng
				eng.Start()
				log.Printf("[SIMULATOR] Dynamically registered and started new AGV: %s at %s", newID, payload.InitialNode)
			}
			mu.Unlock()
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", addVehicleTopic, token.Error())
		}
	})

	opts.SetConnectionLostHandler(func(c paho.Client, err error) {
		log.Printf("[MQTT WARNING] Simulator connection lost: %v. Reconnecting...", err)
	})

	mqttClient = paho.NewClient(opts)
	// Active retry loop until initial MQTT connection is established
	for {
		token := mqttClient.Connect()
		if token.WaitTimeout(5*time.Second) && token.Error() == nil {
			log.Printf("[MQTT] Fleet Simulator successfully connected to broker: %s", mqttBroker)
			break
		}
		var errStr string
		if token.Error() != nil {
			errStr = token.Error().Error()
		} else {
			errStr = "connection timeout"
		}
		log.Printf("[MQTT WARNING] Connect to broker at %s failed: %s (retrying in 2s...)", mqttBroker, errStr)
		time.Sleep(2 * time.Second)
	}

	// Start all initial AGV Engine simulation loops
	mu.Lock()
	for id, eng := range engines {
		eng.Start()
		log.Printf("[SIMULATOR] AGV Engine for %s started simulation at 10Hz.", id)
	}
	mu.Unlock()

	// Wait for termination signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[SIMULATOR SHUTDOWN] Stopping all AGV Engines and disconnecting MQTT...")
	mu.Lock()
	for id, eng := range engines {
		eng.Stop()
		log.Printf("[SIMULATOR SHUTDOWN] Stopped %s", id)
	}
	mu.Unlock()

	if mqttClient != nil && mqttClient.IsConnected() {
		mqttClient.Disconnect(250)
	}
	log.Println("[SIMULATOR SHUTDOWN] Simulator stopped cleanly.")
}
