package mqtthandler

import (
	"encoding/json"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/yi-syong/OmniHive/internal/master/db"
	"github.com/yi-syong/OmniHive/internal/master/store"
	"github.com/yi-syong/OmniHive/internal/master/websocket"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

// Handler processes incoming VDA5050 MQTT messages.
type Handler struct {
	client mqtt.Client
	store  *store.Store
	hub    *websocket.Hub
}

// New creates a new MQTT handler.
func New(broker, clientID, username, password string, s *store.Store, hub *websocket.Hub) (*Handler, error) {
	h := &Handler{
		store: s,
		hub:   hub,
	}

	opts := mqtt.NewClientOptions().
		AddBroker(broker).
		SetClientID(clientID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetOnConnectHandler(func(c mqtt.Client) {
			log.Println("[MQTT] Connected to broker, subscribing...")
			h.subscribe(c)
		}).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			log.Printf("[MQTT] Connection lost: %v", err)
		})

	if username != "" {
		opts.SetUsername(username)
		opts.SetPassword(password)
	}

	h.client = mqtt.NewClient(opts)
	token := h.client.Connect()
	if token.Wait() && token.Error() != nil {
		return nil, token.Error()
	}

	return h, nil
}

// subscribe sets up MQTT topic subscriptions.
func (h *Handler) subscribe(c mqtt.Client) {
	topics := map[string]byte{
		vda5050.SubscribeAllStates():         0,
		vda5050.SubscribeAllVisualizations(): 0,
		vda5050.SubscribeAllConnections():    0,
	}

	token := c.SubscribeMultiple(topics, h.messageHandler)
	if token.Wait() && token.Error() != nil {
		log.Printf("[MQTT] Subscribe error: %v", token.Error())
	} else {
		log.Printf("[MQTT] Subscribed to %d topics", len(topics))
	}
}

// messageHandler routes incoming MQTT messages to the appropriate handler.
func (h *Handler) messageHandler(_ mqtt.Client, msg mqtt.Message) {
	_, _, topicType, err := vda5050.ParseTopic(msg.Topic())
	if err != nil {
		log.Printf("[MQTT] Failed to parse topic %s: %v", msg.Topic(), err)
		return
	}

	switch topicType {
	case vda5050.TopicState:
		h.handleState(msg.Payload())
	case vda5050.TopicVisualization:
		h.handleVisualization(msg.Payload())
	case vda5050.TopicConnection:
		h.handleConnection(msg.Payload())
	default:
		log.Printf("[MQTT] Unknown topic type: %s", topicType)
	}
}

// handleState processes a VDA5050 state message.
func (h *Handler) handleState(payload []byte) {
	var state vda5050.State
	if err := json.Unmarshal(payload, &state); err != nil {
		log.Printf("[MQTT] Failed to unmarshal state: %v", err)
		return
	}

	h.store.UpdateState(&state)

	if state.AGVPosition != nil {
		// Record trajectory (spatial filtering is handled inside)
		db.RecordTrajectory(state.SerialNumber, state.AGVPosition.X, state.AGVPosition.Y, state.AGVPosition.Theta, state.AGVPosition.MapID)
	}

	// Broadcast to WebSocket clients
	h.hub.Broadcast(websocket.Message{
		Type:    "state",
		Payload: state,
	})
}

// handleVisualization processes a VDA5050 visualization message.
func (h *Handler) handleVisualization(payload []byte) {
	var viz vda5050.Visualization
	if err := json.Unmarshal(payload, &viz); err != nil {
		log.Printf("[MQTT] Failed to unmarshal visualization: %v", err)
		return
	}

	h.store.UpdateVisualization(&viz)

	// Broadcast to WebSocket clients
	h.hub.Broadcast(websocket.Message{
		Type:    "visualization",
		Payload: viz,
	})
}

// handleConnection processes a VDA5050 connection message.
func (h *Handler) handleConnection(payload []byte) {
	var conn vda5050.Connection
	if err := json.Unmarshal(payload, &conn); err != nil {
		log.Printf("[MQTT] Failed to unmarshal connection: %v", err)
		return
	}

	h.store.UpdateConnection(&conn)

	// Broadcast to WebSocket clients
	h.hub.Broadcast(websocket.Message{
		Type:    "connection",
		Payload: conn,
	})
}

// Close disconnects from the MQTT broker.
func (h *Handler) Close() {
	h.client.Disconnect(1000)
}

// GetClient returns the underlying MQTT client.
func (h *Handler) GetClient() mqtt.Client {
	return h.client
}

// StartTimeoutChecker periodically checks for timed-out vehicle connections.
func (h *Handler) StartTimeoutChecker(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			h.store.CheckTimeouts()
		}
	}()
}
