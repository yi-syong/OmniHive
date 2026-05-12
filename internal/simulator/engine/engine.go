package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/yi-syong/OmniHive/internal/simulator/charging"
	"github.com/yi-syong/OmniHive/internal/simulator/config"
	"github.com/yi-syong/OmniHive/internal/simulator/vehicle"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

const (
	// tickRate is the simulation update frequency.
	tickRate = 10 * time.Millisecond * 100 // 100ms = 10 Hz
)

// Engine is the main simulation engine that manages vehicles and publishes MQTT messages.
type Engine struct {
	cfg       *config.Config
	client    mqtt.Client
	vehicles  []*vehicle.Vehicle
	charging  *charging.Manager
	mu        sync.RWMutex
}

// New creates a new simulation engine.
func New(cfg *config.Config) *Engine {
	return &Engine{
		cfg:      cfg,
		charging: charging.NewManager(cfg.Charging),
	}
}

// Run starts the simulation engine. It blocks until the context is cancelled.
func (e *Engine) Run(ctx context.Context) error {
	// Connect to MQTT broker
	if err := e.connectMQTT(); err != nil {
		return fmt.Errorf("mqtt connect: %w", err)
	}
	defer e.client.Disconnect(1000)

	// Initialize vehicles
	e.initVehicles()

	// Publish initial connection status for all vehicles
	e.publishAllConnections(vda5050.ConnectionOnline)

	log.Printf("[Engine] Started with %d vehicles", len(e.vehicles))

	// Start simulation loops
	var wg sync.WaitGroup

	// Main simulation tick loop
	wg.Add(1)
	go func() {
		defer wg.Done()
		e.runSimulationLoop(ctx)
	}()

	// State publishing loop
	wg.Add(1)
	go func() {
		defer wg.Done()
		e.runStatePublishLoop(ctx)
	}()

	// Visualization publishing loop
	wg.Add(1)
	go func() {
		defer wg.Done()
		e.runVisualizationPublishLoop(ctx)
	}()

	// Wait for shutdown
	<-ctx.Done()
	log.Println("[Engine] Shutting down...")

	// Publish offline status
	e.publishAllConnections(vda5050.ConnectionOffline)
	time.Sleep(500 * time.Millisecond) // Give time for messages to be sent

	wg.Wait()
	return nil
}

// connectMQTT connects to the MQTT broker.
func (e *Engine) connectMQTT() error {
	opts := mqtt.NewClientOptions().
		AddBroker(e.cfg.MQTT.Broker).
		SetClientID(fmt.Sprintf("%s-engine", e.cfg.MQTT.ClientIDPrefix)).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetOnConnectHandler(func(_ mqtt.Client) {
			log.Println("[MQTT] Connected to broker")
		}).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			log.Printf("[MQTT] Connection lost: %v", err)
		})

	if e.cfg.MQTT.Username != "" {
		opts.SetUsername(e.cfg.MQTT.Username)
		opts.SetPassword(e.cfg.MQTT.Password)
	}

	e.client = mqtt.NewClient(opts)
	token := e.client.Connect()
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}
	return nil
}

// initVehicles creates and configures all simulated vehicles.
func (e *Engine) initVehicles() {
	e.vehicles = make([]*vehicle.Vehicle, e.cfg.Vehicle.Count)

	for i := 0; i < e.cfg.Vehicle.Count; i++ {
		// Assign path: distribute vehicles across available paths
		pathIdx := i % len(e.cfg.Paths)
		waypoints := e.cfg.Paths[pathIdx].GetWaypoints()

		v := vehicle.NewVehicle(
			i+1,
			e.cfg.Vehicle.Manufacturer,
			e.cfg.Vehicle,
			waypoints,
			e.cfg.Factory.MapID,
		)

		// Assign nearest charging station
		if len(waypoints) > 0 {
			station := e.charging.FindNearest(waypoints[0].X, waypoints[0].Y)
			v.SetChargingStation(station, e.cfg.Charging.ChargeRate, e.cfg.Charging.FullCharge)
		}

		// Stagger initial battery levels to make simulation more interesting
		v.Battery = 30 + float64((i*7)%70)

		e.vehicles[i] = v
		log.Printf("[Engine] Created vehicle %s on path %s (battery: %.0f%%)",
			v.SerialNumber, e.cfg.Paths[pathIdx].Name, v.Battery)
	}
}

// runSimulationLoop updates all vehicles at the tick rate.
func (e *Engine) runSimulationLoop(ctx context.Context) {
	ticker := time.NewTicker(tickRate)
	defer ticker.Stop()

	dt := tickRate.Seconds()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.updateVehicles(dt)
			e.checkCollisions()
		}
	}
}

// updateVehicles advances each vehicle by one tick.
func (e *Engine) updateVehicles(dt float64) {
	for _, v := range e.vehicles {
		v.Update(dt)
	}
}

// checkCollisions checks for collisions between vehicles and pauses them if too close.
func (e *Engine) checkCollisions() {
	safetyDist := e.cfg.Vehicle.SafetyDistance

	for i, v1 := range e.vehicles {
		x1, y1 := v1.Position()
		tooClose := false

		for j, v2 := range e.vehicles {
			if i == j {
				continue
			}
			x2, y2 := v2.Position()
			dist := v1.DistanceTo(x2, y2)
			_ = x1
			_ = y1

			if dist < safetyDist {
				tooClose = true
				// The vehicle with higher index yields
				if i > j {
					v1.SetPaused(true)
				}
				break
			}
		}

		if !tooClose {
			v1.SetPaused(false)
		}
	}
}

// runStatePublishLoop publishes VDA5050 state messages at the configured interval.
func (e *Engine) runStatePublishLoop(ctx context.Context) {
	ticker := time.NewTicker(e.cfg.Vehicle.StateInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, v := range e.vehicles {
				state := v.ToState()
				e.publishJSON(
					vda5050.StateTopic(v.Manufacturer, v.SerialNumber),
					state,
				)
			}
		}
	}
}

// runVisualizationPublishLoop publishes high-frequency visualization messages.
func (e *Engine) runVisualizationPublishLoop(ctx context.Context) {
	ticker := time.NewTicker(e.cfg.Vehicle.VisualizationInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, v := range e.vehicles {
				viz := v.ToVisualization()
				e.publishJSON(
					vda5050.VisualizationTopic(v.Manufacturer, v.SerialNumber),
					viz,
				)
			}
		}
	}
}

// publishAllConnections publishes a connection state for all vehicles.
func (e *Engine) publishAllConnections(state vda5050.ConnectionState) {
	for _, v := range e.vehicles {
		msg := vda5050.Connection{
			Header:          vda5050.NewHeader(1, v.Manufacturer, v.SerialNumber),
			ConnectionState: state,
		}
		e.publishJSON(
			vda5050.ConnectionTopic(v.Manufacturer, v.SerialNumber),
			msg,
		)
	}
}

// publishJSON marshals and publishes a message to the MQTT broker.
func (e *Engine) publishJSON(topic string, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[MQTT] Marshal error for %s: %v", topic, err)
		return
	}

	token := e.client.Publish(topic, 0, false, data)
	if token.Wait() && token.Error() != nil {
		log.Printf("[MQTT] Publish error for %s: %v", topic, token.Error())
	}
}
