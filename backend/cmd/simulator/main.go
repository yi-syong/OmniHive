package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"

	"omnihive/backend/internal/engine"
	"omnihive/backend/internal/model"
)

func main() {
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

	agvIDLower := strings.ToLower(agvID)
	orderTopic := fmt.Sprintf("vda5050/v2.1.0/%s/order", agvIDLower)
	stateTopic := fmt.Sprintf("vda5050/v2.1.0/%s/state", agvIDLower)
	telemetryTopic := fmt.Sprintf("omnihive/telemetry/%s", agvIDLower)
	timeScaleTopic := "omnihive/control/time_scale"
	layoutReloadTopic := "omnihive/layout/reload"

	log.Printf("==================================================")
	log.Printf("   OmniHive VDA 5050 Vehicle Behavior Simulator   ")
	log.Printf("   Vehicle ID: %s | MQTT Broker: %s", agvID, mqttBroker)
	log.Printf("   Order Topic:     %s", orderTopic)
	log.Printf("   State Topic:     %s", stateTopic)
	log.Printf("   Telemetry Topic: %s", telemetryTopic)
	log.Printf("   Layout Storage:  %s", layoutFile)
	log.Printf("==================================================")

	// Load factory layout
	layoutMgr, err := engine.NewLayoutManager(layoutFile)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize LayoutManager: %v", err)
	}

	var mqttClient paho.Client
	var agvEngine *engine.AGVEngine

	// 10Hz kinematics state update -> publish to telemetry topic
	onMotionBroadcast := func(msg model.WsStateUpdateMessage) {
		if mqttClient != nil && mqttClient.IsConnected() {
			data, err := json.Marshal(msg)
			if err == nil {
				token := mqttClient.Publish(telemetryTopic, 0, false, data)
				_ = token
			}
		}
	}

	// 1Hz VDA 5050 standard state update -> publish to state topic
	onVDA5050StatePublish := func(state model.State) {
		if mqttClient != nil && mqttClient.IsConnected() {
			data, err := json.Marshal(state)
			if err == nil {
				token := mqttClient.Publish(stateTopic, 1, false, data)
				_ = token
			}
		}
	}

	// Initialize AGV Engine
	agvEngine = engine.NewAGVEngine(agvID, layoutMgr, onMotionBroadcast, onVDA5050StatePublish)

	// MQTT Client configuration
	opts := paho.NewClientOptions()
	opts.AddBroker(mqttBroker)
	opts.SetClientID(fmt.Sprintf("omnihive-sim-%s-%d", agvIDLower, time.Now().UnixNano()))
	opts.SetKeepAlive(60 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(5 * time.Second)

	opts.SetOnConnectHandler(func(c paho.Client) {
		log.Printf("[MQTT] Simulator connected to broker: %s", mqttBroker)

		// 1. Subscribe to VDA 5050 Order topic
		token := c.Subscribe(orderTopic, 1, func(_ paho.Client, m paho.Message) {
			log.Printf("[VDA 5050] Order payload received on %s: %s", m.Topic(), string(m.Payload()))

			var order model.Order
			if err := json.Unmarshal(m.Payload(), &order); err != nil {
				log.Printf("[ERROR] Failed to unmarshal VDA 5050 order: %v", err)
				return
			}

			if len(order.Nodes) == 0 {
				log.Printf("[WARNING] Order contains no nodes")
				return
			}

			for i, node := range order.Nodes {
				actionType := "none"
				if len(node.Actions) > 0 {
					actionType = node.Actions[0].ActionType
				}

				agvOrder := engine.AGVOrder{
					OrderID:    fmt.Sprintf("%s-step%d", order.OrderID, i+1),
					TargetNode: node.NodeID,
					Action:     actionType,
				}

				log.Printf("[SIMULATOR] Queued VDA 5050 Order step %d/%d: Target=%s, Action=%s",
					i+1, len(order.Nodes), agvOrder.TargetNode, agvOrder.Action)
				agvEngine.SubmitOrder(agvOrder)
			}
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", orderTopic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to Order topic: %s", orderTopic)
		}

		// 2. Subscribe to Time Scale Control topic
		token = c.Subscribe(timeScaleTopic, 0, func(_ paho.Client, m paho.Message) {
			valStr := strings.TrimSpace(string(m.Payload()))
			scale, err := strconv.ParseFloat(valStr, 64)
			if err != nil {
				log.Printf("[MQTT WARNING] Invalid time_scale payload: %s", valStr)
				return
			}
			log.Printf("[SIMULATOR] Simulation time scale changed to: %.1fx", scale)
			agvEngine.SetTimeScale(scale)
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", timeScaleTopic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to Time Scale topic: %s", timeScaleTopic)
		}

		// 3. Subscribe to Layout Reload topic
		token = c.Subscribe(layoutReloadTopic, 1, func(_ paho.Client, m paho.Message) {
			log.Printf("[SIMULATOR] Layout reload signal received on %s", m.Topic())
			if err := layoutMgr.ReloadFromFile(); err != nil {
				log.Printf("[SIMULATOR ERROR] Failed to reload layout: %v", err)
			} else {
				log.Printf("[SIMULATOR] Layout successfully reloaded in vehicle simulator")
			}
		})
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", layoutReloadTopic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to Layout Reload topic: %s", layoutReloadTopic)
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
			log.Printf("[MQTT] Simulator successfully connected to broker: %s", mqttBroker)
			break
		}
		var errStr string
		if token.Error() != nil {
			errStr = token.Error().Error()
		} else {
			errStr = "connection timeout"
		}
		log.Printf("[MQTT WARNING] Initial connect to broker at %s failed: %s (retrying in 2s...)", mqttBroker, errStr)
		time.Sleep(2 * time.Second)
	}

	// Start AGV Engine simulation loops
	agvEngine.Start()
	log.Printf("[SIMULATOR] AGV Engine kinematics & battery simulation started at 10Hz.")

	// Wait for termination signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[SIMULATOR SHUTDOWN] Stopping AGV Engine and disconnecting MQTT...")
	agvEngine.Stop()
	if mqttClient != nil && mqttClient.IsConnected() {
		mqttClient.Disconnect(250)
	}
	log.Println("[SIMULATOR SHUTDOWN] Simulator stopped cleanly.")
}
