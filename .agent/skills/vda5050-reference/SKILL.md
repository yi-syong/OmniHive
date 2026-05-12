---
name: vda5050-reference
description: Reference for VDA5050 standard implementation used in this project.
---

# VDA5050 Implementation Details

The OmniHive platform implements VDA5050 v2.0.

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
