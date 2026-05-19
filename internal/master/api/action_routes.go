package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type actionRequest struct {
	ActionType string  `json:"actionType" binding:"required"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Theta      float64 `json:"theta"`
	MapID      string  `json:"mapId"`
}

// postVehicleAction handles sending instant actions to a vehicle.
func (h *Handler) postVehicleAction(c *gin.Context) {
	vehicleID := c.Param("id")

	var req actionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var err error
	switch req.ActionType {
	case "initPosition":
		if req.MapID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mapId is required for initPosition"})
			return
		}
		err = h.orderManager.InitPosition(vehicleID, req.X, req.Y, req.Theta, req.MapID)
	case "cancelOrder":
		err = h.orderManager.CancelOrder(vehicleID)
	case "startPause":
		err = h.orderManager.StartPause(vehicleID)
	case "stopPause":
		err = h.orderManager.StopPause(vehicleID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported actionType"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "action sent successfully"})
}
