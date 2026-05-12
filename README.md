# 🐝 OmniHive

> Open-source VDA5050 Fleet Management & Visualization Platform

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Go](https://img.shields.io/badge/Go-1.24+-00ADD8?logo=go)](https://go.dev)
[![Vue.js](https://img.shields.io/badge/Vue.js-3-4FC08D?logo=vue.js)](https://vuejs.org)
[![VDA5050](https://img.shields.io/badge/VDA5050-v2.0-orange)](https://github.com/VDA5050/VDA5050)

OmniHive is an open-source AGV/AMR fleet management platform built on the **VDA5050 v2.0** standard. It provides real-time vehicle monitoring, route network planning, and task dispatching capabilities.

## ✨ Features

- 🗺️ **Real-time Map** — Live 2D factory floor visualization with vehicle tracking
- 📊 **Dashboard** — Vehicle status, battery levels, and system overview
- 🚗 **VDA5050 v2.0** — Native support for the industry-standard AGV communication protocol
- 🔧 **Route Planning** — Visual route network editor *(Phase 2)*
- 📋 **Task Dispatching** — Order management and traffic control *(Phase 3)*
- 🐝 **Built-in Simulator** — Test with virtual vehicles, no hardware needed

## 🏗️ Architecture

```
┌─────────────────────────────┐
│    Web Dashboard            │  Vue3 + Quasar + Leaflet
│    (Port 3000)              │
└──────────┬──────────────────┘
           │ WebSocket + REST
┌──────────▼──────────────────┐
│    Master Control           │  Go + Gin
│    (Port 8080)              │
└──────────┬──────────────────┘
           │ MQTT
┌──────────▼──────────────────┐
│    Mosquitto Broker         │  MQTT 3.1.1
│    (Port 1883)              │
└──────────┬──────────────────┘
           │ MQTT
┌──────────▼──────────────────┐
│    Vehicle Simulator        │  Go (VDA5050 compliant)
└─────────────────────────────┘
```

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/yi-syong/OmniHive.git
cd OmniHive

# Start all services
cd deployments
docker compose up -d

# Open the dashboard
open http://localhost:3000
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.24+ / Gin |
| Frontend | Vue3 + Quasar Framework |
| Map Visualization | Leaflet + CRS.Simple |
| Communication | MQTT (Mosquitto) + WebSocket |
| Database | PostgreSQL |
| Deployment | Docker Compose |

## 📁 Project Structure

```
omnihive/
├── cmd/                    # Application entry points
│   ├── master/             # Master Control server
│   └── simulator/          # Vehicle simulator
├── internal/               # Private application code
│   ├── master/             # Master Control logic
│   ├── simulator/          # Simulator logic
│   └── vda5050/            # VDA5050 type definitions
├── web/                    # Vue3 + Quasar frontend
├── configs/                # Configuration files
├── deployments/            # Docker & deployment files
└── docs/                   # Documentation
```

## 📋 Roadmap

- [x] Phase 1: Real-time visualization (Simulator + Dashboard)
- [ ] Phase 2: Route network planning
- [ ] Phase 3: Task dispatching & traffic control
- [ ] Phase 4: Advanced analytics (heatmaps, replay, alerts)

## 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).
