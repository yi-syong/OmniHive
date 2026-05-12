package charging

import (
	"math"

	"github.com/yi-syong/OmniHive/internal/simulator/config"
)

// Station represents a charging station on the factory floor.
type Station struct {
	Name     string
	Position config.Point
}

// Manager manages all charging stations and assigns vehicles to them.
type Manager struct {
	Stations []Station
}

// NewManager creates a charging manager from configuration.
func NewManager(cfg config.ChargingConfig) *Manager {
	stations := make([]Station, len(cfg.Stations))
	for i, s := range cfg.Stations {
		stations[i] = Station{
			Name:     s.Name,
			Position: s.Position,
		}
	}
	return &Manager{Stations: stations}
}

// FindNearest returns the nearest charging station to the given position.
// Returns nil if no stations are configured.
func (m *Manager) FindNearest(x, y float64) *config.Point {
	if len(m.Stations) == 0 {
		return nil
	}

	var nearest *config.Point
	minDist := math.MaxFloat64

	for i := range m.Stations {
		dx := m.Stations[i].Position.X - x
		dy := m.Stations[i].Position.Y - y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist < minDist {
			minDist = dist
			p := m.Stations[i].Position
			nearest = &p
		}
	}

	return nearest
}
