---
name: mqtt-patterns
description: Guidelines for MQTT usage and topic handling in OmniHive.
---

# MQTT Patterns for OmniHive

## Connection
- All services connecting to the MQTT broker must use `AutoReconnect(true)` and handle connection lost gracefully.
- Master Control uses a unique Client ID `omnihive-master`.
- Simulators use prefixed Client IDs `omnihive-sim`.

## Topic Parsing
- Always use `strings.Split(topic, "/")` for parsing topic paths. Do not use `fmt.Sscanf` as it behaves unpredictably with hyphens.
- Ensure the parsed topic length matches the expected depth (e.g., 5 parts for `omnihive/v2/manufacturer/serialNumber/topic`).

## Publishing
- Use JSON serialization for all MQTT payloads.
- QoS 0 is used for high-frequency data like `visualization`.
- QoS 1 may be used for `order` or `instantActions` to ensure delivery (Phase 3).

## Timeouts
- Use Last Will and Testament (LWT) for unexpected disconnects. (To be implemented)
- Master Control must independently track vehicle connection timeouts if a vehicle stops sending `state` messages.
