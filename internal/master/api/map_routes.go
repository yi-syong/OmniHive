package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yi-syong/OmniHive/internal/master/db"
)

// getMaps returns all maps.
func (h *Handler) getMaps(c *gin.Context) {
	var maps []db.Map
	if err := db.DB.Find(&maps).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch maps"})
		return
	}
	c.JSON(http.StatusOK, maps)
}

// uploadMap handles uploading a new base map image and creating a map record.
func (h *Handler) uploadMap(c *gin.Context) {
	name := c.PostForm("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}

	// Save file to uploads directory
	filename := fmt.Sprintf("%d_%s", time.Now().Unix(), filepath.Base(file.Filename))
	uploadPath := filepath.Join("uploads", filename)
	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image"})
		return
	}

	// Create map record
	newMap := db.Map{
		Name:           name,
		ImageURL:       "/uploads/" + filename,
		MetersPerPixel: 1.0, // default
		// TODO: Extract actual width/height from image if needed, or get from frontend
	}

	if err := db.DB.Create(&newMap).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save map to database"})
		return
	}

	c.JSON(http.StatusCreated, newMap)
}

// calibrateMap updates the MetersPerPixel scale for a map.
func (h *Handler) calibrateMap(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid map ID"})
		return
	}

	var req struct {
		MetersPerPixel float64 `json:"metersPerPixel" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var mapRecord db.Map
	if err := db.DB.First(&mapRecord, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "map not found"})
		return
	}

	mapRecord.MetersPerPixel = req.MetersPerPixel
	if err := db.DB.Save(&mapRecord).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update map"})
		return
	}

	c.JSON(http.StatusOK, mapRecord)
}

// deleteMap deletes a map and its associated nodes/edges
func (h *Handler) deleteMap(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid map ID"})
		return
	}

	var mapRecord db.Map
	if err := db.DB.First(&mapRecord, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "map not found"})
		return
	}

	// GORM cascade delete will take care of Nodes and Edges
	if err := db.DB.Unscoped().Delete(&mapRecord).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete map"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "map deleted successfully"})
}
