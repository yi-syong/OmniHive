package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yi-syong/OmniHive/internal/master/db"
	"github.com/yi-syong/OmniHive/internal/master/order"
	"github.com/yi-syong/OmniHive/internal/master/store"
	"github.com/yi-syong/OmniHive/internal/master/websocket"
)

// Handler holds dependencies for REST API handlers.
type Handler struct {
	store        *store.Store
	hub          *websocket.Hub
	orderManager *order.Manager
}

// NewHandler creates a new API handler.
func NewHandler(s *store.Store, hub *websocket.Hub, om *order.Manager) *Handler {
	return &Handler{
		store:        s,
		hub:          hub,
		orderManager: om,
	}
}

// SetupRoutes configures all API routes on the given Gin engine.
func (h *Handler) SetupRoutes(r *gin.Engine) {
	// CORS middleware
	r.Use(corsMiddleware())

	// WebSocket endpoint
	r.GET("/ws", func(c *gin.Context) {
		h.hub.HandleWebSocket(c.Writer, c.Request)
	})

	// REST API v1
	v1 := r.Group("/api/v1")
	{
		// Vehicle endpoints
		vehicles := v1.Group("/vehicles")
		{
			vehicles.GET("", h.listVehicles)
			vehicles.GET("/:id", h.getVehicle)
			vehicles.GET("/:id/state", h.getVehicleState)
			vehicles.GET("/:id/trajectory", h.getVehicleTrajectory)
			vehicles.POST("/:id/actions", h.postVehicleAction)
		}

		// Order endpoints
		orders := v1.Group("/orders")
		{
			orders.POST("", h.createOrder)
		}

		// System endpoints
		system := v1.Group("/system")
		{
			system.GET("/status", h.getSystemStatus)
		}

		// Map endpoints
		maps := v1.Group("/maps")
		{
			maps.GET("", h.getMaps)
			maps.POST("", h.uploadMap)
			maps.PUT("/:id/calibrate", h.calibrateMap)
			maps.DELETE("/:id", h.deleteMap)
		}

		// Network endpoints
		network := v1.Group("/network")
		{
			network.GET("", h.getNetwork)
			network.POST("/nodes", h.createNode)
			network.PUT("/nodes/:id", h.updateNode)
			network.DELETE("/nodes/:id", h.deleteNode)
			network.POST("/edges", h.createEdge)
			network.PUT("/edges/:id", h.updateEdge)
			network.DELETE("/edges/:id", h.deleteEdge)
		}
	}

	// Serve uploaded maps statically
	r.Static("/uploads", "./uploads")

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}

// listVehicles returns all tracked vehicles.
func (h *Handler) listVehicles(c *gin.Context) {
	vehicles := h.store.GetAll()

	type VehicleSummary struct {
		SerialNumber    string  `json:"serialNumber"`
		Manufacturer    string  `json:"manufacturer"`
		ConnectionState string  `json:"connectionState"`
		Driving         bool    `json:"driving"`
		BatteryCharge   float64 `json:"batteryCharge"`
		Charging        bool    `json:"charging"`
		X               float64 `json:"x"`
		Y               float64 `json:"y"`
		Theta           float64 `json:"theta"`
		OperatingMode   string  `json:"operatingMode"`
		ErrorCount      int     `json:"errorCount"`
	}

	summaries := make([]VehicleSummary, 0, len(vehicles))
	for _, vs := range vehicles {
		summary := VehicleSummary{
			SerialNumber:    vs.SerialNumber,
			Manufacturer:    vs.Manufacturer,
			ConnectionState: string(vs.ConnectionState),
		}

		if vs.State != nil {
			summary.Driving = vs.State.Driving
			summary.BatteryCharge = vs.State.BatteryState.BatteryCharge
			summary.Charging = vs.State.BatteryState.Charging
			summary.OperatingMode = string(vs.State.OperatingMode)
			summary.ErrorCount = len(vs.State.Errors)
			if vs.State.AGVPosition != nil {
				summary.X = vs.State.AGVPosition.X
				summary.Y = vs.State.AGVPosition.Y
				summary.Theta = vs.State.AGVPosition.Theta
			}
		}

		summaries = append(summaries, summary)
	}

	c.JSON(http.StatusOK, gin.H{
		"vehicles": summaries,
		"count":    len(summaries),
	})
}

// getVehicle returns detailed information for a specific vehicle.
func (h *Handler) getVehicle(c *gin.Context) {
	id := c.Param("id")

	vs, ok := h.store.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "vehicle not found"})
		return
	}

	c.JSON(http.StatusOK, vs)
}

// getVehicleState returns the latest VDA5050 state for a vehicle.
func (h *Handler) getVehicleState(c *gin.Context) {
	id := c.Param("id")

	vs, ok := h.store.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "vehicle not found"})
		return
	}

	if vs.State == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no state available"})
		return
	}

	c.JSON(http.StatusOK, vs.State)
}

// getVehicleTrajectory returns the recent trajectory points for a vehicle.
func (h *Handler) getVehicleTrajectory(c *gin.Context) {
	id := c.Param("id")

	var points []db.VehicleTrajectory
	if err := db.DB.Where("serial_number = ?", id).Order("created_at asc").Find(&points).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch trajectory"})
		return
	}

	c.JSON(http.StatusOK, points)
}

// getSystemStatus returns aggregate system statistics.
func (h *Handler) getSystemStatus(c *gin.Context) {
	status := h.store.GetSystemStatus()
	c.JSON(http.StatusOK, status)
}

// corsMiddleware adds CORS headers for development.
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
