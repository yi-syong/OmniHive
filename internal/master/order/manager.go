package order

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/yi-syong/OmniHive/internal/master/store"
	"github.com/yi-syong/OmniHive/internal/vda5050"
	"github.com/google/uuid"
)

// Manager handles the lifecycle of orders and actions.
type Manager struct {
	mqttClient mqtt.Client
	store      *store.Store
}

// NewManager creates a new Order Manager.
func NewManager(client mqtt.Client, s *store.Store) *Manager {
	return &Manager{
		mqttClient: client,
		store:      s,
	}
}

// SendOrder publishes a VDA5050 Order to a specific vehicle.
func (m *Manager) SendOrder(vehicleID string, order vda5050.Order) error {
	vs, ok := m.store.Get(vehicleID)
	if !ok {
		return fmt.Errorf("vehicle %s not found", vehicleID)
	}

	// Prepare header
	order.Header = vda5050.NewHeader(time.Now().UnixNano(), vs.Manufacturer, vs.SerialNumber)

	payload, err := json.Marshal(order)
	if err != nil {
		return fmt.Errorf("marshal order: %w", err)
	}

	topic := vda5050.OrderTopic(vs.Manufacturer, vs.SerialNumber)
	token := m.mqttClient.Publish(topic, 1, false, payload)
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("publish order: %w", token.Error())
	}

	log.Printf("[OrderManager] Sent order %s to vehicle %s (topic: %s)", order.OrderID, vehicleID, topic)
	return nil
}

// CreateAndSendOrder is a helper to build an Order from a list of nodes and send it.
func (m *Manager) CreateAndSendOrder(vehicleID string, nodes []vda5050.Node, edges []vda5050.Edge) error {
	orderID := uuid.New().String()
	
	order := vda5050.Order{
		OrderID:       orderID,
		OrderUpdateID: 0,
		Nodes:         nodes,
		Edges:         edges,
	}
	
	return m.SendOrder(vehicleID, order)
}
