package db

import (
	"log"
	"math"
	"time"
)

// RecordTrajectory conditionally saves a vehicle's position if it moved significantly.
func RecordTrajectory(serialNumber string, x, y, theta float64, mapID string) error {
	// Find last position
	var lastTraj VehicleTrajectory
	err := DB.Where("serial_number = ?", serialNumber).Order("created_at desc").First(&lastTraj).Error
	if err == nil {
		// Calculate distance
		dx := x - lastTraj.X
		dy := y - lastTraj.Y
		dist := math.Sqrt(dx*dx + dy*dy)

		// Spatial filter: only record if moved > 0.5m or changed map
		if dist < 0.5 && mapID == lastTraj.MapID {
			return nil
		}
	}

	traj := VehicleTrajectory{
		SerialNumber: serialNumber,
		X:            x,
		Y:            y,
		Theta:        theta,
		MapID:        mapID,
		CreatedAt:    time.Now(),
	}

	return DB.Create(&traj).Error
}

// StartTrajectoryCleanupRoutine starts a background worker to delete old trajectories.
func StartTrajectoryCleanupRoutine(retention time.Duration) {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-retention)
			res := DB.Where("created_at < ?", cutoff).Delete(&VehicleTrajectory{})
			if res.Error != nil {
				log.Printf("[DB] Trajectory cleanup error: %v", res.Error)
			} else if res.RowsAffected > 0 {
				log.Printf("[DB] Cleaned up %d old trajectory points", res.RowsAffected)
			}
		}
	}()
}
