package vda5050

import (
	"fmt"
	"strings"
)

const (
	// InterfaceName is the base topic prefix for OmniHive.
	InterfaceName = "omnihive"
	// TopicVersion is the protocol version used in topic paths.
	TopicVersion = "v2"
)

// Topic names as defined by VDA5050.
const (
	TopicState          = "state"
	TopicVisualization  = "visualization"
	TopicConnection     = "connection"
	TopicOrder          = "order"
	TopicInstantActions = "instantActions"
)

// TopicBase returns the base topic path for a given AGV.
// Format: omnihive/v2/{manufacturer}/{serialNumber}
func TopicBase(manufacturer, serialNumber string) string {
	return fmt.Sprintf("%s/%s/%s/%s", InterfaceName, TopicVersion, manufacturer, serialNumber)
}

// StateTopic returns the full state topic for an AGV.
func StateTopic(manufacturer, serialNumber string) string {
	return fmt.Sprintf("%s/%s", TopicBase(manufacturer, serialNumber), TopicState)
}

// VisualizationTopic returns the full visualization topic for an AGV.
func VisualizationTopic(manufacturer, serialNumber string) string {
	return fmt.Sprintf("%s/%s", TopicBase(manufacturer, serialNumber), TopicVisualization)
}

// ConnectionTopic returns the full connection topic for an AGV.
func ConnectionTopic(manufacturer, serialNumber string) string {
	return fmt.Sprintf("%s/%s", TopicBase(manufacturer, serialNumber), TopicConnection)
}

// OrderTopic returns the full order topic for an AGV (Phase 3).
func OrderTopic(manufacturer, serialNumber string) string {
	return fmt.Sprintf("%s/%s", TopicBase(manufacturer, serialNumber), TopicOrder)
}

// SubscribeAllStates returns the wildcard topic to subscribe to all AGV states.
// Format: omnihive/v2/+/+/state
func SubscribeAllStates() string {
	return fmt.Sprintf("%s/%s/+/+/%s", InterfaceName, TopicVersion, TopicState)
}

// SubscribeAllVisualizations returns the wildcard topic for all AGV visualizations.
func SubscribeAllVisualizations() string {
	return fmt.Sprintf("%s/%s/+/+/%s", InterfaceName, TopicVersion, TopicVisualization)
}

// SubscribeAllConnections returns the wildcard topic for all AGV connections.
func SubscribeAllConnections() string {
	return fmt.Sprintf("%s/%s/+/+/%s", InterfaceName, TopicVersion, TopicConnection)
}

// ParseTopic extracts manufacturer, serialNumber, and topic type from a topic string.
// Expected format: omnihive/v2/{manufacturer}/{serialNumber}/{topicType}
func ParseTopic(topic string) (manufacturer, serialNumber, topicType string, err error) {
	parts := strings.Split(topic, "/")
	if len(parts) != 5 {
		return "", "", "", fmt.Errorf("invalid topic format (expected 5 parts, got %d): %s", len(parts), topic)
	}
	return parts[2], parts[3], parts[4], nil
}
