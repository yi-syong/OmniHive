package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/yi-syong/OmniHive/internal/master/db"
)

// getNetwork returns nodes and edges for a specific map.
func (h *Handler) getNetwork(c *gin.Context) {
	mapIDStr := c.Query("mapId")
	if mapIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mapId query parameter is required"})
		return
	}

	mapID, err := strconv.Atoi(mapIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mapId"})
		return
	}

	var nodes []db.Node
	if err := db.DB.Where("map_id = ?", mapID).Find(&nodes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch nodes"})
		return
	}

	var edges []db.Edge
	if err := db.DB.Where("map_id = ?", mapID).Find(&edges).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch edges"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes": nodes,
		"edges": edges,
	})
}

// createNode creates a new Node.
func (h *Handler) createNode(c *gin.Context) {
	var node db.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.DB.Create(&node).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create node"})
		return
	}

	c.JSON(http.StatusCreated, node)
}

// updateNode updates an existing Node.
func (h *Handler) updateNode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node ID"})
		return
	}

	var node db.Node
	if err := db.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}

	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.DB.Save(&node).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update node"})
		return
	}

	c.JSON(http.StatusOK, node)
}

// deleteNode deletes a Node.
func (h *Handler) deleteNode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node ID"})
		return
	}

	if err := db.DB.Delete(&db.Node{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete node"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// createEdge creates a new Edge.
func (h *Handler) createEdge(c *gin.Context) {
	var edge db.Edge
	if err := c.ShouldBindJSON(&edge); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.DB.Create(&edge).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create edge"})
		return
	}

	c.JSON(http.StatusCreated, edge)
}

// updateEdge updates an existing Edge.
func (h *Handler) updateEdge(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid edge ID"})
		return
	}

	var edge db.Edge
	if err := db.DB.First(&edge, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "edge not found"})
		return
	}

	if err := c.ShouldBindJSON(&edge); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.DB.Save(&edge).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update edge"})
		return
	}

	c.JSON(http.StatusOK, edge)
}

// deleteEdge deletes an Edge.
func (h *Handler) deleteEdge(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid edge ID"})
		return
	}

	if err := db.DB.Delete(&db.Edge{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete edge"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
