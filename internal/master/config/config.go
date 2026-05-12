package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds the Master Control configuration.
type Config struct {
	Server ServerConfig `yaml:"server"`
	MQTT   MQTTConfig   `yaml:"mqtt"`
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
}

// Addr returns the server listen address.
func (s ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}

// MQTTConfig holds MQTT connection settings.
type MQTTConfig struct {
	Broker   string `yaml:"broker"`
	ClientID string `yaml:"client_id"`
	Username string `yaml:"username,omitempty"`
	Password string `yaml:"password,omitempty"`
}

// Load reads and parses the master control configuration from a YAML file.
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
	if cfg.Server.Host == "" {
		cfg.Server.Host = "0.0.0.0"
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.MQTT.Broker == "" {
		cfg.MQTT.Broker = "tcp://localhost:1883"
	}
	if cfg.MQTT.ClientID == "" {
		cfg.MQTT.ClientID = "omnihive-master"
	}
}
