package engine

import (
	"math"
	"sync"
)

type BatteryEngine struct {
	mu sync.RWMutex

	level     float64 // 0.0 to 100.0
	charging  bool
	mode      string  // "IDLE", "MOVING", "ACTING", "CC_CHARGING", "CV_CHARGING", "CHARGED"
	drainRate float64 // % per second

	// Base rate parameters (at 1x time scale)
	idleDrainRate     float64 // 0.005 %/s
	movingBaseRate    float64 // 0.08 %/s at MaxSpeed
	actingDrainRate   float64 // 0.35 %/s during pick/drop
	cargoDrainFactor  float64 // 1.4x when loaded
	chargingCCRate    float64 // 3.5 %/s during Constant Current phase
	ccThreshold       float64 // 80.0 % threshold for CC -> CV transition
}

func NewBatteryEngine(initialLevel float64) *BatteryEngine {
	if initialLevel <= 0 {
		initialLevel = 95.0
	}
	return &BatteryEngine{
		level:            initialLevel,
		charging:         false,
		mode:             "IDLE",
		drainRate:        0.005,
		idleDrainRate:    0.005,
		movingBaseRate:   0.08,
		actingDrainRate:  0.35,
		cargoDrainFactor: 1.4,
		chargingCCRate:   3.5,
		ccThreshold:      80.0,
	}
}

// Update calculates battery level change over dynamic delta time dt (which already accounts for timeScale)
func (b *BatteryEngine) Update(status AGVStatus, action string, speed, maxSpeed float64, hasCargo, isCharging bool, dt float64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if isCharging {
		b.charging = true
		if b.level >= 99.99 {
			b.level = 100.0
			b.mode = "CHARGED"
			b.drainRate = 0.0
			return
		}

		// Realistic CC / CV charging curve:
		// CC (Constant Current): fast linear charge up to 80%
		// CV (Constant Voltage): exponential decay of current from 80% to 100%
		if b.level < b.ccThreshold {
			b.mode = "CC_CHARGING"
			b.drainRate = b.chargingCCRate // positive rate means charging
			b.level += b.chargingCCRate * dt
		} else {
			b.mode = "CV_CHARGING"
			// Asymptotic decay factor based on remaining capacity
			decay := (100.0 - b.level) / (100.0 - b.ccThreshold)
			rate := math.Max(0.15, b.chargingCCRate*decay)
			b.drainRate = rate
			b.level += rate * dt
		}

		if b.level > 100.0 {
			b.level = 100.0
			b.mode = "CHARGED"
		}
		return
	}

	b.charging = false

	// Discharging states
	switch status {
	case StatusDriving:
		b.mode = "MOVING"
		speedRatio := 0.2
		if maxSpeed > 0 {
			speedRatio = math.Max(0.1, speed/maxSpeed)
		}
		rate := b.movingBaseRate * speedRatio
		if hasCargo {
			rate *= b.cargoDrainFactor
		}
		b.drainRate = rate
		b.level -= rate * dt

	case StatusActing:
		b.mode = "ACTING"
		b.drainRate = b.actingDrainRate
		b.level -= b.actingDrainRate * dt

	case StatusIdle:
		fallthrough
	default:
		b.mode = "IDLE"
		b.drainRate = b.idleDrainRate
		b.level -= b.idleDrainRate * dt
	}

	if b.level < 0.0 {
		b.level = 0.0
	}
}

func (b *BatteryEngine) SetLevel(level float64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.level = math.Max(0.0, math.Min(100.0, level))
}

func (b *BatteryEngine) GetStatus() (level float64, charging bool, mode string, rate float64) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.level, b.charging, b.mode, b.drainRate
}
