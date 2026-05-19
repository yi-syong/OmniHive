package db

import (
	"time"

	"gorm.io/gorm"
)

// Map represents a factory floor map or specific area.
type Map struct {
	ID             uint           `gorm:"primarykey" json:"id"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	Name           string         `gorm:"uniqueIndex;not null" json:"name"`
	ImageURL       string         `json:"imageUrl"`
	MetersPerPixel float64        `gorm:"default:1.0" json:"metersPerPixel"` // Scale for calibration
	Width          int            `json:"width"`                             // Image width in pixels
	Height         int            `json:"height"`                            // Image height in pixels
	Nodes          []Node         `gorm:"foreignKey:MapID;constraint:OnDelete:CASCADE" json:"-"`
	Edges          []Edge         `gorm:"foreignKey:MapID;constraint:OnDelete:CASCADE" json:"-"`
}

// Node represents a VDA5050 node.
type Node struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	MapID     uint           `gorm:"not null;index" json:"mapId"`

	// VDA5050 properties
	NodeID      string  `gorm:"uniqueIndex;not null" json:"nodeId"`
	X           float64 `gorm:"not null" json:"x"`
	Y           float64 `gorm:"not null" json:"y"`
	Description string  `json:"description"`
}

// Edge represents a VDA5050 edge connecting two nodes.
type Edge struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	MapID     uint           `gorm:"not null;index" json:"mapId"`

	// VDA5050 properties
	EdgeID      string  `gorm:"uniqueIndex;not null" json:"edgeId"`
	StartNodeID string  `gorm:"not null;index" json:"startNodeId"` // Refers to Node.NodeID
	EndNodeID   string  `gorm:"not null;index" json:"endNodeId"`   // Refers to Node.NodeID
	Description string  `json:"description"`
	MaxSpeed    float64 `json:"maxSpeed"` // e.g. 1.5 m/s
	Direction   string  `gorm:"default:'bidirectional'" json:"direction"` // 'bidirectional', 'unidirectional'
}

// VehicleTrajectory represents a historical position point of a vehicle.
type VehicleTrajectory struct {
	ID           uint      `gorm:"primarykey" json:"id"`
	SerialNumber string    `gorm:"index;not null" json:"serialNumber"`
	X            float64   `gorm:"not null" json:"x"`
	Y            float64   `gorm:"not null" json:"y"`
	Theta        float64   `json:"theta"`
	MapID        string    `gorm:"index;not null" json:"mapId"`
	CreatedAt    time.Time `gorm:"index" json:"createdAt"`
}
