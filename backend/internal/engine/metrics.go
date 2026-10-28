package engine

import (
	"sync"
)

// FleetMetrics represents the real-time aggregated A/B testing telemetry for the fleet.
type FleetMetrics struct {
	Type             string  `json:"type"` // "traffic_metrics"
	StrategyName     string  `json:"strategy_name"`
	Throughput       int     `json:"throughput"`           // KPI 1: Cumulative completed orders
	TotalWaitTimeSec float64 `json:"total_wait_time_sec"`  // KPI 2: Total traffic wait seconds
	AvgExtraCostPct  float64 `json:"avg_extra_cost_pct"`   // KPI 3: Extra energy cost % vs shortest baseline
	ActiveVehicles   int     `json:"active_vehicles"`
}

// MetricsCollector tracks and aggregates fleet operational performance indicators.
type MetricsCollector struct {
	mu                    sync.RWMutex
	throughput            int
	totalWaitTimeSec      float64
	baselineBatteryDrain  float64
	actualBatteryDrain    float64
	baselineDistanceM     float64
	actualDistanceM       float64
	strategyMgr           *TrafficStrategyManager
}

func NewMetricsCollector(strategyMgr *TrafficStrategyManager) *MetricsCollector {
	return &MetricsCollector{
		strategyMgr: strategyMgr,
	}
}

// RecordMissionCompleted records a successfully finished order and its distance comparison.
func (mc *MetricsCollector) RecordMissionCompleted(baselineDist, actualDist float64) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	mc.throughput++
	mc.baselineDistanceM += baselineDist
	mc.actualDistanceM += actualDist

	// Energy estimate: ~0.08% battery per meter driven
	energyPerMeter := 0.08
	mc.baselineBatteryDrain += (baselineDist * energyPerMeter)
	mc.actualBatteryDrain += (actualDist * energyPerMeter)
}

// RecordWaitTick records accumulated traffic wait seconds for a vehicle.
func (mc *MetricsCollector) RecordWaitTick(waitSec float64) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.totalWaitTimeSec += waitSec
}

// Reset clears all counters (e.g. upon strategy hot-swap or benchmark restart).
func (mc *MetricsCollector) Reset() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.throughput = 0
	mc.totalWaitTimeSec = 0
	mc.baselineBatteryDrain = 0
	mc.actualBatteryDrain = 0
	mc.baselineDistanceM = 0
	mc.actualDistanceM = 0
}

// GetMetrics returns the current FleetMetrics snapshot.
func (mc *MetricsCollector) GetMetrics(activeVehicles int) FleetMetrics {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	strategyName := "wait"
	if mc.strategyMgr != nil {
		strategyName = mc.strategyMgr.GetStrategyName()
	}

	extraPct := 0.0
	if mc.baselineBatteryDrain > 0 {
		diff := mc.actualBatteryDrain - mc.baselineBatteryDrain
		if diff > 0 {
			extraPct = (diff / mc.baselineBatteryDrain) * 100.0
		}
	}

	return FleetMetrics{
		Type:             "traffic_metrics",
		StrategyName:     strategyName,
		Throughput:       mc.throughput,
		TotalWaitTimeSec: roundFloat(mc.totalWaitTimeSec, 1),
		AvgExtraCostPct:  roundFloat(extraPct, 1),
		ActiveVehicles:   activeVehicles,
	}
}
