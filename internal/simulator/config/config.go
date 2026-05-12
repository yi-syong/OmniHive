package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds the simulator configuration.
type Config struct {
	MQTT    MQTTConfig    `yaml:"mqtt"`
	Factory FactoryConfig `yaml:"factory"`
	Vehicle VehicleConfig `yaml:"vehicles"`
	Charging ChargingConfig `yaml:"charging"`
	Paths   []PathConfig  `yaml:"paths"`
}

// MQTTConfig holds MQTT connection settings.
type MQTTConfig struct {
	Broker         string `yaml:"broker"`
	ClientIDPrefix string `yaml:"client_id_prefix"`
	Username       string `yaml:"username,omitempty"`
	Password       string `yaml:"password,omitempty"`
}

// FactoryConfig defines the factory floor dimensions.
type FactoryConfig struct {
	Width  float64 `yaml:"width"`
	Height float64 `yaml:"height"`
	MapID  string  `yaml:"map_id"`
}

// VehicleConfig holds vehicle simulation parameters.
type VehicleConfig struct {
	Count                 int           `yaml:"count"`
	Manufacturer          string        `yaml:"manufacturer"`
	Speed                 float64       `yaml:"speed"`
	BatteryCapacity       float64       `yaml:"battery_capacity"`
	BatteryDrain          float64       `yaml:"battery_drain"`
	LowBatteryThreshold   float64       `yaml:"low_battery_threshold"`
	SafetyDistance         float64       `yaml:"safety_distance"`
	StateInterval         time.Duration `yaml:"state_interval"`
	VisualizationInterval time.Duration `yaml:"visualization_interval"`
}

// ChargingConfig holds charging station settings.
type ChargingConfig struct {
	Stations     []StationConfig `yaml:"stations"`
	ChargeRate   float64         `yaml:"charge_rate"`
	FullCharge   float64         `yaml:"full_charge"`
}

// StationConfig defines a single charging station.
type StationConfig struct {
	Name     string  `yaml:"name"`
	Position Point   `yaml:"position"`
}

// Point represents a 2D coordinate.
type Point struct {
	X float64 `yaml:"x"`
	Y float64 `yaml:"y"`
}

// PathConfig defines a path that vehicles can follow.
type PathConfig struct {
	Name   string    `yaml:"name"`
	Points [][]float64 `yaml:"points"`
}

// GetWaypoints converts the raw point arrays to Point structs.
func (p *PathConfig) GetWaypoints() []Point {
	waypoints := make([]Point, len(p.Points))
	for i, pt := range p.Points {
		if len(pt) >= 2 {
			waypoints[i] = Point{X: pt[0], Y: pt[1]}
		}
	}
	return waypoints
}

// Load reads and parses the simulator configuration from a YAML file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	cfg := &Config{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	applyDefaults(cfg)
	return cfg, nil
}

func applyDefaults(cfg *Config) {
	if cfg.MQTT.Broker == "" {
		cfg.MQTT.Broker = "tcp://localhost:1883"
	}
	if cfg.MQTT.ClientIDPrefix == "" {
		cfg.MQTT.ClientIDPrefix = "omnihive-sim"
	}
	if cfg.Factory.Width == 0 {
		cfg.Factory.Width = 200
	}
	if cfg.Factory.Height == 0 {
		cfg.Factory.Height = 100
	}
	if cfg.Factory.MapID == "" {
		cfg.Factory.MapID = "factory-default"
	}
	if cfg.Vehicle.Count == 0 {
		cfg.Vehicle.Count = 10
	}
	if cfg.Vehicle.Manufacturer == "" {
		cfg.Vehicle.Manufacturer = "omnihive-sim"
	}
	if cfg.Vehicle.Speed == 0 {
		cfg.Vehicle.Speed = 1.5
	}
	if cfg.Vehicle.BatteryCapacity == 0 {
		cfg.Vehicle.BatteryCapacity = 100
	}
	if cfg.Vehicle.BatteryDrain == 0 {
		cfg.Vehicle.BatteryDrain = 0.01
	}
	if cfg.Vehicle.LowBatteryThreshold == 0 {
		cfg.Vehicle.LowBatteryThreshold = 15
	}
	if cfg.Vehicle.SafetyDistance == 0 {
		cfg.Vehicle.SafetyDistance = 2.0
	}
	if cfg.Vehicle.StateInterval == 0 {
		cfg.Vehicle.StateInterval = time.Second
	}
	if cfg.Vehicle.VisualizationInterval == 0 {
		cfg.Vehicle.VisualizationInterval = 100 * time.Millisecond
	}
	if cfg.Charging.ChargeRate == 0 {
		cfg.Charging.ChargeRate = 0.5
	}
	if cfg.Charging.FullCharge == 0 {
		cfg.Charging.FullCharge = 95
	}
}
