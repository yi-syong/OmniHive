package vda5050

import (
	"fmt"
	"strings"
)

// ValidateState performs basic validation on a State message.
func ValidateState(s *State) error {
	if err := validateHeader(&s.Header); err != nil {
		return fmt.Errorf("state: %w", err)
	}

	if s.OperatingMode == "" {
		return fmt.Errorf("state: operatingMode is required")
	}

	if !isValidOperatingMode(s.OperatingMode) {
		return fmt.Errorf("state: invalid operatingMode: %s", s.OperatingMode)
	}

	if err := validateBatteryState(&s.BatteryState); err != nil {
		return fmt.Errorf("state: %w", err)
	}

	if err := validateSafetyState(&s.SafetyState); err != nil {
		return fmt.Errorf("state: %w", err)
	}

	return nil
}

// ValidateConnection performs basic validation on a Connection message.
func ValidateConnection(c *Connection) error {
	if err := validateHeader(&c.Header); err != nil {
		return fmt.Errorf("connection: %w", err)
	}

	if !isValidConnectionState(c.ConnectionState) {
		return fmt.Errorf("connection: invalid connectionState: %s", c.ConnectionState)
	}

	return nil
}

// ValidateVisualization performs basic validation on a Visualization message.
func ValidateVisualization(v *Visualization) error {
	if err := validateHeader(&v.Header); err != nil {
		return fmt.Errorf("visualization: %w", err)
	}
	return nil
}

// validateHeader checks common header fields.
func validateHeader(h *Header) error {
	if h.HeaderID < 0 {
		return fmt.Errorf("headerId must be >= 0")
	}
	if strings.TrimSpace(h.Version) == "" {
		return fmt.Errorf("version is required")
	}
	if strings.TrimSpace(h.Manufacturer) == "" {
		return fmt.Errorf("manufacturer is required")
	}
	if strings.TrimSpace(h.SerialNumber) == "" {
		return fmt.Errorf("serialNumber is required")
	}
	return nil
}

// validateBatteryState checks battery state values.
func validateBatteryState(b *BatteryState) error {
	if b.BatteryCharge < 0 || b.BatteryCharge > 100 {
		return fmt.Errorf("batteryCharge must be between 0 and 100, got %.2f", b.BatteryCharge)
	}
	return nil
}

// validateSafetyState checks safety state values.
func validateSafetyState(s *SafetyState) error {
	if !isValidEStopState(s.EStop) {
		return fmt.Errorf("invalid eStop state: %s", s.EStop)
	}
	return nil
}

func isValidOperatingMode(m OperatingMode) bool {
	switch m {
	case OperatingModeAutomatic, OperatingModeSemiAuto, OperatingModeManual,
		OperatingModeService, OperatingModeTeachIn:
		return true
	}
	return false
}

func isValidConnectionState(s ConnectionState) bool {
	switch s {
	case ConnectionOnline, ConnectionOffline, ConnectionConnectionBroken:
		return true
	}
	return false
}

func isValidEStopState(s EStopState) bool {
	switch s {
	case EStopAutoAck, EStopManual, EStopRemote, EStopNone:
		return true
	}
	return false
}
