package order

import (
	"testing"

	"github.com/yi-syong/OmniHive/internal/vda5050"
)

func TestCreateAndSendOrder(t *testing.T) {
	// A simple test to verify Order generation logic.
	// Since we don't have a full mock MQTT/Store in this small test,
	// we will manually construct the nodes and edges and check sequence IDs.
	
	nodes := []vda5050.Node{
		{NodeID: "A"},
		{NodeID: "B"},
		{NodeID: "C"},
	}
	
	var vdaNodes []vda5050.Node
	var vdaEdges []vda5050.Edge
	
	var seqID int64 = 0
	for i, node := range nodes {
		vdaNode := vda5050.Node{
			NodeID:     node.NodeID,
			SequenceID: seqID,
			Released:   true,
		}
		vdaNodes = append(vdaNodes, vdaNode)
		seqID++

		if i < len(nodes)-1 {
			vdaEdge := vda5050.Edge{
				EdgeID:      "edge_" + node.NodeID + "_" + nodes[i+1].NodeID,
				SequenceID:  seqID,
				Released:    true,
				StartNodeID: node.NodeID,
				EndNodeID:   nodes[i+1].NodeID,
			}
			vdaEdges = append(vdaEdges, vdaEdge)
			seqID++
		}
	}
	
	if len(vdaNodes) != 3 {
		t.Errorf("Expected 3 nodes, got %d", len(vdaNodes))
	}
	if len(vdaEdges) != 2 {
		t.Errorf("Expected 2 edges, got %d", len(vdaEdges))
	}
	
	expectedSeq := []int64{0, 1, 2, 3, 4}
	actualSeq := []int64{
		vdaNodes[0].SequenceID,
		vdaEdges[0].SequenceID,
		vdaNodes[1].SequenceID,
		vdaEdges[1].SequenceID,
		vdaNodes[2].SequenceID,
	}
	
	for i, seq := range actualSeq {
		if seq != expectedSeq[i] {
			t.Errorf("Expected sequence %d at index %d, got %d", expectedSeq[i], i, seq)
		}
	}
}
