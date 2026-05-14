---
name: vda5050-reference
description: Reference for VDA5050 standard implementation and MQTT usage guidelines used in this project.
---

# VDA5050 Implementation Details

The OmniHive platform implements VDA5050.
For detailed protocol specification, JSON structures, order/state state machines, and data types, **ALWAYS refer to the complete specification document** located at:
`./references/VDA5050_EN.md` (relative to this SKILL.md file).

## Core Concepts
- **Manufacturer**: The manufacturer of the AGV.
- **SerialNumber**: The unique serial number of the AGV.

## MQTT Topic Structure
The base topic structure is:
`omnihive/v2/<manufacturer>/<serialNumber>/<topic>`

Topics used:
- `state`: Published periodically by the AGV (1Hz or as configured). Contains full AGV state, battery, and errors.
- `visualization`: Published at a higher frequency (10Hz) for UI updates. Contains positioning and velocity.
- `connection`: Published on connect/disconnect. Contains `connectionState` (ONLINE, OFFLINE, CONNECTIONBROKEN).
- `order`: Used by the Master Control to dispatch paths and nodes to the AGV (Phase 3).
- `instantActions`: Used for immediate commands like pause, resume, cancel (Phase 3).

## Data Types
- Position requires `x`, `y`, `theta`.
- Battery charge is 0-100 percentage.
- Operating modes: AUTOMATIC, SEMIAUTOMATIC, MANUAL, SERVICE, TEACHIN.

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
