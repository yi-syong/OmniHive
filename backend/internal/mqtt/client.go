package mqtt

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
	"github.com/google/uuid"

	"omnihive/backend/internal/engine"
	"omnihive/backend/internal/model"
)

type MqttBridge struct {
	client            paho.Client
	agvID             string
	orderTopic        string
	stateTopic        string
	telemetryTopic    string
	timeScaleTopic    string
	layoutReloadTopic string
	onTelemetryRx     func(msg model.WsStateUpdateMessage)
	onStateRx         func(state model.State)
	nodeLookup        func(nodeID string) (float64, float64)
}

func (b *MqttBridge) SetNodeLookup(fn func(nodeID string) (float64, float64)) {
	b.nodeLookup = fn
}

func NewMqttBridge(brokerURL, agvID string, onTelemetryRx func(model.WsStateUpdateMessage), onStateRx func(model.State)) (*MqttBridge, error) {
	agvIDLower := strings.ToLower(agvID)
	orderTopic := fmt.Sprintf("vda5050/v2.1.0/%s/order", agvIDLower)
	stateTopic := fmt.Sprintf("vda5050/v2.1.0/%s/state", agvIDLower)
	telemetryTopic := fmt.Sprintf("omnihive/telemetry/%s", agvIDLower)
	timeScaleTopic := "omnihive/control/time_scale"
	layoutReloadTopic := "omnihive/layout/reload"

	bridge := &MqttBridge{
		agvID:             agvID,
		orderTopic:        orderTopic,
		stateTopic:        stateTopic,
		telemetryTopic:    telemetryTopic,
		timeScaleTopic:    timeScaleTopic,
		layoutReloadTopic: layoutReloadTopic,
		onTelemetryRx:     onTelemetryRx,
		onStateRx:         onStateRx,
	}

	opts := paho.NewClientOptions()
	opts.AddBroker(brokerURL)
	opts.SetClientID(fmt.Sprintf("omnihive-backend-%s-%d", agvIDLower, time.Now().UnixNano()))
	opts.SetKeepAlive(60 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(5 * time.Second)

	opts.SetOnConnectHandler(func(c paho.Client) {
		log.Printf("[MQTT] Backend connected to broker: %s", brokerURL)

		// 1. Subscribe to vehicle telemetry (10Hz kinematics stream from simulator)
		token := c.Subscribe(telemetryTopic, 0, bridge.handleTelemetryMessage)
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", telemetryTopic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to vehicle telemetry stream: %s", telemetryTopic)
		}

		// Also subscribe to wildcard telemetry in case multiple AGVs appear
		tokenWild := c.Subscribe("omnihive/telemetry/+", 0, bridge.handleTelemetryMessage)
		tokenWild.Wait()

		// 2. Subscribe to VDA 5050 State topic
		token = c.Subscribe(stateTopic, 1, bridge.handleStateMessage)
		if token.Wait() && token.Error() != nil {
			log.Printf("[MQTT ERROR] Failed to subscribe to %s: %v", stateTopic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to VDA 5050 state topic: %s", stateTopic)
		}
	})

	opts.SetConnectionLostHandler(func(c paho.Client, err error) {
		log.Printf("[MQTT WARNING] Backend MQTT connection lost: %v. Reconnecting...", err)
	})

	client := paho.NewClient(opts)
	// Active retry loop until initial MQTT connection is established
	for {
		token := client.Connect()
		if token.WaitTimeout(5*time.Second) && token.Error() == nil {
			log.Printf("[MQTT] Backend successfully connected to broker: %s", brokerURL)
			break
		}
		var errStr string
		if token.Error() != nil {
			errStr = token.Error().Error()
		} else {
			errStr = "connection timeout"
		}
		log.Printf("[MQTT WARNING] Backend connect to broker at %s failed: %s (retrying in 2s...)", brokerURL, errStr)
		time.Sleep(2 * time.Second)
	}

	bridge.client = client
	return bridge, nil
}

func (b *MqttBridge) handleTelemetryMessage(_ paho.Client, m paho.Message) {
	var msg model.WsStateUpdateMessage
	if err := json.Unmarshal(m.Payload(), &msg); err != nil {
		return
	}
	if b.onTelemetryRx != nil {
		b.onTelemetryRx(msg)
	}
}

func (b *MqttBridge) handleStateMessage(_ paho.Client, m paho.Message) {
	var state model.State
	if err := json.Unmarshal(m.Payload(), &state); err != nil {
		return
	}
	if b.onStateRx != nil {
		b.onStateRx(state)
	}
}

// PublishTimeScale publishes simulation speed multiplier to simulator via MQTT
func (b *MqttBridge) PublishTimeScale(scale float64) error {
	if b.client == nil || !b.client.IsConnected() {
		return fmt.Errorf("MQTT not connected")
	}
	payload := fmt.Sprintf("%.1f", scale)
	token := b.client.Publish(b.timeScaleTopic, 0, false, []byte(payload))
	token.Wait()
	return token.Error()
}

// PublishLayoutReload publishes layout reload notification to simulator via MQTT
func (b *MqttBridge) PublishLayoutReload() error {
	if b.client == nil || !b.client.IsConnected() {
		return fmt.Errorf("MQTT not connected")
	}
	token := b.client.Publish(b.layoutReloadTopic, 1, false, []byte("reload"))
	token.Wait()
	return token.Error()
}

// TranslateAndPublishOrder translates a frontend dispatch command into standard VDA 5050 Order and sends via MQTT
func (b *MqttBridge) TranslateAndPublishOrderWithSteps(steps []model.WsDispatchOrderItem) error {
	orderID := fmt.Sprintf("ord-%s", uuid.New().String()[:8])
	now := time.Now().UTC()

	vdaNodes := make([]model.Node, len(steps))
	for i, step := range steps {
		vdaActions := []model.Action{}
		if step.Action != "" && step.Action != "none" {
			vdaActions = append(vdaActions, model.Action{
				ActionID:          fmt.Sprintf("act-%s-%d", uuid.New().String()[:6], i+1),
				ActionType:        step.Action,
				ActionDescription: fmt.Sprintf("Execute %s at %s", step.Action, step.NodeID),
				BlockingType:      "HARD",
			})
		}

		var posX, posY float64
		if b.nodeLookup != nil {
			posX, posY = b.nodeLookup(step.NodeID)
		} else if nodeInfo, ok := engine.FactoryMap[step.NodeID]; ok {
			posX, posY = nodeInfo.X, nodeInfo.Z
		}

		vdaNodes[i] = model.Node{
			NodeID:     step.NodeID,
			SequenceID: uint32((i + 1) * 2),
			Released:   true,
			NodePosition: &model.NodePosition{
				X:     posX,
				Y:     posY,
				MapID: "factory-map-1",
			},
			Actions: vdaActions,
		}
	}

	order := model.Order{
		Header: model.Header{
			HeaderID:     uint32(now.Unix()),
			Timestamp:    now,
			Version:      "2.1.0",
			Manufacturer: "OmniHive",
			SerialNumber: b.agvID,
		},
		OrderID:       orderID,
		OrderUpdateID: 0,
		Nodes:         vdaNodes,
		Edges:         []model.Edge{},
	}

	data, err := json.Marshal(order)
	if err != nil {
		return fmt.Errorf("failed to marshal VDA 5050 order: %w", err)
	}

	if b.client == nil || !b.client.IsConnected() {
		return fmt.Errorf("MQTT broker not connected")
	}

	token := b.client.Publish(b.orderTopic, 1, false, data)
	token.Wait()
	if token.Error() != nil {
		return fmt.Errorf("failed to publish MQTT order: %w", token.Error())
	}

	log.Printf("[MQTT] Dispatched VDA 5050 Multi-Step Order %s (%d nodes) to %s", orderID, len(vdaNodes), b.orderTopic)
	return nil
}

func (b *MqttBridge) TranslateAndPublishOrder(targetNode, action string) error {
	return b.TranslateAndPublishOrderWithSteps([]model.WsDispatchOrderItem{
		{NodeID: targetNode, Action: action},
	})
}

func (b *MqttBridge) Close() {
	if b.client != nil && b.client.IsConnected() {
		b.client.Disconnect(250)
	}
}
