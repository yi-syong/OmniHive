package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/yi-syong/OmniHive/internal/master/db"
	"github.com/yi-syong/OmniHive/internal/vda5050"
)

// createOrderRequest represents the payload for creating an order.
type createOrderRequest struct {
	VehicleID string   `json:"vehicleId" binding:"required"`
	NodeIDs   []string `json:"nodeIds" binding:"required"`
}

// createOrder creates and dispatches a VDA5050 Order to a vehicle.
func (h *Handler) createOrder(c *gin.Context) {
	var req createOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.NodeIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nodeIds cannot be empty"})
		return
	}

	// Fetch nodes from DB
	var dbNodes []db.Node
	if err := db.DB.Where("node_id IN ?", req.NodeIDs).Find(&dbNodes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch nodes from database"})
		return
	}

	// Create a map for quick lookup
	nodeMap := make(map[string]db.Node)
	for _, n := range dbNodes {
		nodeMap[n.NodeID] = n
	}

	// Verify all nodes exist
	for _, id := range req.NodeIDs {
		if _, exists := nodeMap[id]; !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("node %s not found", id)})
			return
		}
	}

	// Construct VDA5050 Nodes and Edges
	var vdaNodes []vda5050.Node
	var vdaEdges []vda5050.Edge

	var seqID int64 = 0

	for i, nodeID := range req.NodeIDs {
		dbn := nodeMap[nodeID]

		vdaNode := vda5050.Node{
			NodeID:     dbn.NodeID,
			SequenceID: seqID,
			Released:   true,
			NodePosition: &vda5050.AGVPosition{
				X:                   dbn.X,
				Y:                   dbn.Y,
				Theta:               0, // Assuming 0 for now unless specified
				MapID:               strconv.Itoa(int(dbn.MapID)), // DB MapID is uint, in string for MapID. Wait, MapID in DB is the relation, Name is the actual mapId. Let's fetch the map to get its name.
				PositionInitialized: true,
			},
			Actions: []vda5050.Action{},
		}
		
		// Need Map name.
		var m db.Map
		if err := db.DB.First(&m, dbn.MapID).Error; err == nil {
			vdaNode.NodePosition.MapID = m.Name
		} else {
			vdaNode.NodePosition.MapID = "unknown"
		}

		vdaNodes = append(vdaNodes, vdaNode)
		seqID++

		if i < len(req.NodeIDs)-1 {
			nextNodeID := req.NodeIDs[i+1]
			edgeID := fmt.Sprintf("edge_%s_%s", nodeID, nextNodeID)

			vdaEdge := vda5050.Edge{
				EdgeID:      edgeID,
				SequenceID:  seqID,
				Released:    true,
				StartNodeID: nodeID,
				EndNodeID:   nextNodeID,
				Actions:     []vda5050.Action{},
			}
			vdaEdges = append(vdaEdges, vdaEdge)
			seqID++
		}
	}

	if err := h.orderManager.CreateAndSendOrder(req.VehicleID, vdaNodes, vdaEdges); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "order sent successfully"})
}
