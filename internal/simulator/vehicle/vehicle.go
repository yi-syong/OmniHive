package vehicle

import (
	"fmt"
	"math"
	"sync"

	"github.com/yi-syong/OmniHive/internal/simulator/config"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

// Status represents the current operating status of a vehicle.
type Status string

const (
	StatusDriving  Status = "DRIVING"
	StatusIdle     Status = "IDLE"
	StatusCharging Status = "CHARGING"
	StatusPaused   Status = "PAUSED"
)

// Vehicle represents a simulated AGV.
type Vehicle struct {
	mu sync.RWMutex

	// Identity
	SerialNumber string
	Manufacturer string

	// Position & movement
	X     float64
	Y     float64
	Theta float64
	Speed float64
	MaxSpeed float64

	// Battery
	Battery       float64
	BatteryDrain  float64
	LowThreshold  float64

	// Status
	Status        Status
	OperatingMode vda5050.OperatingMode
	Driving       bool
	Paused        bool
	Errors        []vda5050.Error

	// Path following
	Waypoints     []config.Point
	CurrentWPIdx  int
	Forward       bool // true = forward along waypoints, false = reverse

	// Charging
	ChargingStation *config.Point
	ChargeRate      float64
	FullCharge      float64

	// Map
	MapID string

	// Message counters
	StateHeaderID int64
	VizHeaderID   int64

	// Order tracking
	CurrentOrderID      string
	NodeStates          []vda5050.NodeState
	EdgeStates          []vda5050.EdgeState
	PositionInitialized bool
}

// NewVehicle creates a new simulated vehicle.
func NewVehicle(id int, manufacturer string, cfg config.VehicleConfig, waypoints []config.Point, mapID string) *Vehicle {
	serialNumber := fmt.Sprintf("AGV-%03d", id)

	var startX, startY float64
	if len(waypoints) > 0 {
		startX = waypoints[0].X
		startY = waypoints[0].Y
	}

	return &Vehicle{
		SerialNumber:  serialNumber,
		Manufacturer:  manufacturer,
		X:             startX,
		Y:             startY,
		Theta:         0,
		Speed:         0,
		MaxSpeed:      cfg.Speed,
		Battery:       cfg.BatteryCapacity,
		BatteryDrain:  cfg.BatteryDrain,
		LowThreshold:  cfg.LowBatteryThreshold,
		Status:        StatusIdle,
		OperatingMode: vda5050.OperatingModeAutomatic,
		Driving:       false,
		Paused:        false,
		Errors:        []vda5050.Error{},
		Waypoints:     waypoints,
		CurrentWPIdx:  0,
		Forward:       true,
		MapID:         mapID,
		PositionInitialized: true, // Default to true using YAML starting position
	}
}

// Update advances the vehicle simulation by one tick (dt in seconds).
func (v *Vehicle) Update(dt float64) {
	v.mu.Lock()
	defer v.mu.Unlock()

	switch v.Status {
	case StatusCharging:
		v.updateCharging(dt)
	case StatusPaused:
		v.Speed = 0
		v.Driving = false
	case StatusDriving:
		v.updateDriving(dt)
		v.updateBattery(dt)
	case StatusIdle:
		// Do nothing, wait for order
	}
}

// updateDriving moves the vehicle toward the next waypoint.
func (v *Vehicle) updateDriving(dt float64) {
	if len(v.Waypoints) == 0 {
		v.Status = StatusIdle
		return
	}

	target := v.Waypoints[v.CurrentWPIdx]
	dx := target.X - v.X
	dy := target.Y - v.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	// Calculate desired theta (heading toward target)
	v.Theta = math.Atan2(dy, dx)

	moveDistance := v.MaxSpeed * dt

	if dist <= moveDistance {
		// Arrived at waypoint
		v.X = target.X
		v.Y = target.Y
		// Mark node/edge as passed if needed, simplified for now
		if v.CurrentWPIdx < len(v.NodeStates) {
			v.NodeStates[v.CurrentWPIdx].Released = true
		}
		v.advanceWaypoint()
	} else {
		// Move toward target
		ratio := moveDistance / dist
		v.X += dx * ratio
		v.Y += dy * ratio
	}

	v.Speed = v.MaxSpeed
	v.Driving = true
}

// advanceWaypoint moves to the next waypoint or stops if at the end.
func (v *Vehicle) advanceWaypoint() {
	if v.CurrentWPIdx >= len(v.Waypoints)-1 {
		v.Status = StatusIdle
		v.Driving = false
		v.Speed = 0
		v.Waypoints = nil
		v.CurrentOrderID = ""
	} else {
		v.CurrentWPIdx++
	}
}

// updateBattery drains the battery while driving.
func (v *Vehicle) updateBattery(dt float64) {
	v.Battery -= v.BatteryDrain * dt
	if v.Battery < 0 {
		v.Battery = 0
	}

	if v.Battery <= v.LowThreshold && v.ChargingStation != nil {
		v.Status = StatusCharging
		v.Driving = false
		v.Speed = 0
		v.OperatingMode = vda5050.OperatingModeAutomatic
	}
}

// updateCharging charges the battery at the charging station.
func (v *Vehicle) updateCharging(dt float64) {
	v.Battery += v.ChargeRate * dt
	v.Driving = false
	v.Speed = 0

	if v.Battery >= v.FullCharge {
		v.Battery = v.FullCharge
		v.Status = StatusDriving
		v.Driving = true
		v.OperatingMode = vda5050.OperatingModeAutomatic
	}
}

// startDriving begins driving along the waypoint path.
func (v *Vehicle) startDriving() {
	if len(v.Waypoints) > 0 {
		v.Status = StatusDriving
		v.Driving = true
	}
}

// NeedsCharging returns true if the vehicle's battery is low.
func (v *Vehicle) NeedsCharging() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.Battery <= v.LowThreshold
}

// SetPaused pauses or unpauses the vehicle (for collision avoidance).
func (v *Vehicle) SetPaused(paused bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if paused {
		v.Paused = true
		v.Status = StatusPaused
		v.Speed = 0
		v.Driving = false
	} else {
		v.Paused = false
		v.Status = StatusDriving
	}
}

// SetChargingStation assigns a charging station and charge parameters.
func (v *Vehicle) SetChargingStation(station *config.Point, chargeRate, fullCharge float64) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.ChargingStation = station
	v.ChargeRate = chargeRate
	v.FullCharge = fullCharge
}

// Position returns the current position (thread-safe).
func (v *Vehicle) Position() (x, y float64) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.X, v.Y
}

// ToState generates a VDA5050 State message from the current vehicle state.
func (v *Vehicle) ToState() vda5050.State {
	v.mu.RLock()
	defer v.mu.RUnlock()

	v.StateHeaderID++

	opMode := v.OperatingMode
	if v.Status == StatusCharging {
		opMode = vda5050.OperatingModeAutomatic
	}

	return vda5050.State{
		Header: vda5050.NewHeader(v.StateHeaderID, v.Manufacturer, v.SerialNumber),
		AGVPosition: &vda5050.AGVPosition{
			X:                   v.X,
			Y:                   v.Y,
			Theta:               v.Theta,
			MapID:               v.MapID,
			PositionInitialized: true,
		},
		Velocity: &vda5050.Velocity{
			Vx: v.Speed * math.Cos(v.Theta),
			Vy: v.Speed * math.Sin(v.Theta),
		},
		BatteryState: vda5050.BatteryState{
			BatteryCharge: v.Battery,
			Charging:      v.Status == StatusCharging,
		},
		OperatingMode: opMode,
		Driving:       v.Driving,
		Paused:        v.Paused,
		SafetyState: vda5050.SafetyState{
			EStop:          vda5050.EStopNone,
			FieldViolation: false,
		},
		Errors:       v.Errors,
		OrderID:      v.CurrentOrderID,
		NodeStates:   v.NodeStates,
		EdgeStates:   v.EdgeStates,
		ActionStates: []vda5050.ActionState{},
	}
}

// ToVisualization generates a VDA5050 Visualization message.
func (v *Vehicle) ToVisualization() vda5050.Visualization {
	v.mu.RLock()
	defer v.mu.RUnlock()

	v.VizHeaderID++

	return vda5050.Visualization{
		Header: vda5050.NewHeader(v.VizHeaderID, v.Manufacturer, v.SerialNumber),
		AGVPosition: &vda5050.AGVPosition{
			X:                   v.X,
			Y:                   v.Y,
			Theta:               v.Theta,
			MapID:               v.MapID,
			PositionInitialized: v.PositionInitialized,
		},
		Velocity: &vda5050.Velocity{
			Vx: v.Speed * math.Cos(v.Theta),
			Vy: v.Speed * math.Sin(v.Theta),
		},
	}
}

// DistanceTo calculates the distance to another point.
func (v *Vehicle) DistanceTo(x, y float64) float64 {
	v.mu.RLock()
	defer v.mu.RUnlock()
	dx := v.X - x
	dy := v.Y - y
	return math.Sqrt(dx*dx + dy*dy)
}
