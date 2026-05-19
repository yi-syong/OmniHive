package order

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

// SendInstantAction publishes a VDA5050 InstantActions message to a vehicle.
func (m *Manager) SendInstantAction(vehicleID string, actions []vda5050.Action) error {
	vs, ok := m.store.Get(vehicleID)
	if !ok {
		return fmt.Errorf("vehicle %s not found", vehicleID)
	}

	msg := vda5050.InstantActions{
		Header:  vda5050.NewHeader(time.Now().UnixNano(), vs.Manufacturer, vs.SerialNumber),
		Actions: actions,
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal instantActions: %w", err)
	}

	topic := vda5050.InstantActionTopic(vs.Manufacturer, vs.SerialNumber)
	token := m.mqttClient.Publish(topic, 1, false, payload)
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("publish instantActions: %w", token.Error())
	}

	log.Printf("[OrderManager] Sent %d instant actions to vehicle %s (topic: %s)", len(actions), vehicleID, topic)
	return nil
}

// Action helpers

// InitPosition creates an initPosition action and sends it.
func (m *Manager) InitPosition(vehicleID string, x, y, theta float64, mapID string) error {
	action := vda5050.Action{
		ActionID:          uuid.New().String(),
		ActionType:        "initPosition",
		ActionDescription: "Initialize AGV position",
		BlockingType:      "HARD",
		ActionParameters: []vda5050.ActionParameter{
			{Key: "x", Value: x},
			{Key: "y", Value: y},
			{Key: "theta", Value: theta},
			{Key: "mapId", Value: mapID},
		},
	}
	return m.SendInstantAction(vehicleID, []vda5050.Action{action})
}

// CancelOrder sends a cancelOrder action.
func (m *Manager) CancelOrder(vehicleID string) error {
	action := vda5050.Action{
		ActionID:          uuid.New().String(),
		ActionType:        "cancelOrder",
		ActionDescription: "Cancel current order",
		BlockingType:      "HARD",
	}
	return m.SendInstantAction(vehicleID, []vda5050.Action{action})
}

// StartPause sends a startPause action.
func (m *Manager) StartPause(vehicleID string) error {
	action := vda5050.Action{
		ActionID:          uuid.New().String(),
		ActionType:        "startPause",
		ActionDescription: "Pause AGV",
		BlockingType:      "HARD",
	}
	return m.SendInstantAction(vehicleID, []vda5050.Action{action})
}

// StopPause sends a stopPause action.
func (m *Manager) StopPause(vehicleID string) error {
	action := vda5050.Action{
		ActionID:          uuid.New().String(),
		ActionType:        "stopPause",
		ActionDescription: "Resume AGV",
		BlockingType:      "HARD",
	}
	return m.SendInstantAction(vehicleID, []vda5050.Action{action})
}
