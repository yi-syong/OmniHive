package store

import (
	"sync"
	"time"

	"github.com/yi-syong/OmniHive/internal/vda5050"
)

// VehicleState holds the latest known state of a vehicle.
type VehicleState struct {
	// Identity
	Manufacturer string `json:"manufacturer"`
	SerialNumber string `json:"serialNumber"`

	// Latest VDA5050 state
	State *vda5050.State `json:"state,omitempty"`

	// Latest visualization (high-frequency position)
	Visualization *vda5050.Visualization `json:"visualization,omitempty"`

	// Connection status
	ConnectionState vda5050.ConnectionState `json:"connectionState"`

	// Timestamps
	LastStateUpdate  time.Time `json:"lastStateUpdate"`
	LastVizUpdate    time.Time `json:"lastVizUpdate"`
	LastConnUpdate   time.Time `json:"lastConnUpdate"`
}

// Store is an in-memory store for vehicle states.
type Store struct {
	mu       sync.RWMutex
	vehicles map[string]*VehicleState // key: serialNumber

	// Timeout for marking vehicles as connection broken.
	connectionTimeout time.Duration
}

// New creates a new in-memory store.
func New(connectionTimeout time.Duration) *Store {
	if connectionTimeout == 0 {
		connectionTimeout = 30 * time.Second
	}
	return &Store{
		vehicles:          make(map[string]*VehicleState),
		connectionTimeout: connectionTimeout,
	}
}

// UpdateState updates the state for a vehicle.
func (s *Store) UpdateState(state *vda5050.State) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := state.SerialNumber
	vs := s.getOrCreate(key, state.Manufacturer)
	vs.State = state
	vs.LastStateUpdate = time.Now()

	// Mark as online if we're receiving state messages
	if vs.ConnectionState != vda5050.ConnectionOnline {
		vs.ConnectionState = vda5050.ConnectionOnline
	}
}

// UpdateVisualization updates the visualization data for a vehicle.
func (s *Store) UpdateVisualization(viz *vda5050.Visualization) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := viz.SerialNumber
	vs := s.getOrCreate(key, viz.Manufacturer)
	vs.Visualization = viz
	vs.LastVizUpdate = time.Now()
}

// UpdateConnection updates the connection state for a vehicle.
func (s *Store) UpdateConnection(conn *vda5050.Connection) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := conn.SerialNumber
	vs := s.getOrCreate(key, conn.Manufacturer)
	vs.ConnectionState = conn.ConnectionState
	vs.LastConnUpdate = time.Now()
}

// Get returns the state of a specific vehicle.
func (s *Store) Get(serialNumber string) (*VehicleState, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	vs, ok := s.vehicles[serialNumber]
	if !ok {
		return nil, false
	}
	return vs, true
}

// GetAll returns all vehicle states.
func (s *Store) GetAll() []*VehicleState {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*VehicleState, 0, len(s.vehicles))
	for _, vs := range s.vehicles {
		result = append(result, vs)
	}
	return result
}

// Count returns the number of tracked vehicles.
func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.vehicles)
}

// CheckTimeouts marks vehicles as CONNECTIONBROKEN if no state received within timeout.
func (s *Store) CheckTimeouts() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for _, vs := range s.vehicles {
		if vs.ConnectionState == vda5050.ConnectionOnline &&
			!vs.LastStateUpdate.IsZero() &&
			now.Sub(vs.LastStateUpdate) > s.connectionTimeout {
			vs.ConnectionState = vda5050.ConnectionConnectionBroken
		}
	}
}

// getOrCreate returns or creates a VehicleState entry.
func (s *Store) getOrCreate(serialNumber, manufacturer string) *VehicleState {
	vs, ok := s.vehicles[serialNumber]
	if !ok {
		vs = &VehicleState{
			Manufacturer:    manufacturer,
			SerialNumber:    serialNumber,
			ConnectionState: vda5050.ConnectionOnline,
		}
		s.vehicles[serialNumber] = vs
	}
	return vs
}

// SystemStatus returns an overview of the system state.
type SystemStatus struct {
	TotalVehicles  int `json:"totalVehicles"`
	OnlineCount    int `json:"onlineCount"`
	OfflineCount   int `json:"offlineCount"`
	BrokenCount    int `json:"brokenCount"`
	DrivingCount   int `json:"drivingCount"`
	ChargingCount  int `json:"chargingCount"`
	ErrorCount     int `json:"errorCount"`
}

// GetSystemStatus returns aggregate system statistics.
func (s *Store) GetSystemStatus() SystemStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	status := SystemStatus{
		TotalVehicles: len(s.vehicles),
	}

	for _, vs := range s.vehicles {
		switch vs.ConnectionState {
		case vda5050.ConnectionOnline:
			status.OnlineCount++
		case vda5050.ConnectionOffline:
			status.OfflineCount++
		case vda5050.ConnectionConnectionBroken:
			status.BrokenCount++
		}

		if vs.State != nil {
			if vs.State.Driving {
				status.DrivingCount++
			}
			if vs.State.BatteryState.Charging {
				status.ChargingCount++
			}
			if len(vs.State.Errors) > 0 {
				status.ErrorCount++
			}
		}
	}

	return status
}
