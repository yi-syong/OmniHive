package engine

import (
	"sync"
)

// ResourceRegistry manages thread-safe mutual exclusion locks for all topology nodes and edges.
// In VDA 5050 fleet traffic control, a node or edge cannot be simultaneously released (Base)
// to more than one AGV without causing collision or conflict.
type ResourceRegistry struct {
	mu        sync.RWMutex
	nodeLocks map[string]string // nodeID -> agvID
	edgeLocks map[string]string // edgeID -> agvID
}

// NewResourceRegistry creates an initialized, thread-safe resource registry.
func NewResourceRegistry() *ResourceRegistry {
	return &ResourceRegistry{
		nodeLocks: make(map[string]string),
		edgeLocks: make(map[string]string),
	}
}

// TryLockNode attempts to acquire exclusive ownership of a node for an AGV.
// Returns true if the lock was successfully acquired or already owned by this AGV.
func (r *ResourceRegistry) TryLockNode(nodeID, agvID string) bool {
	if nodeID == "" || agvID == "" {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	owner, exists := r.nodeLocks[nodeID]
	if !exists || owner == "" || owner == agvID {
		r.nodeLocks[nodeID] = agvID
		return true
	}
	return false
}

// UnlockNode releases ownership of a node if owned by the specified AGV.
func (r *ResourceRegistry) UnlockNode(nodeID, agvID string) {
	if nodeID == "" || agvID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if owner, exists := r.nodeLocks[nodeID]; exists && owner == agvID {
		delete(r.nodeLocks, nodeID)
	}
}

// IsNodeLocked checks if a node is currently locked and returns the owner AGV ID.
func (r *ResourceRegistry) IsNodeLocked(nodeID string) (bool, string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	owner, exists := r.nodeLocks[nodeID]
	return exists && owner != "", owner
}

// TryLockEdge attempts to acquire exclusive ownership of an edge for an AGV.
func (r *ResourceRegistry) TryLockEdge(edgeID, agvID string) bool {
	if edgeID == "" || agvID == "" {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	owner, exists := r.edgeLocks[edgeID]
	if !exists || owner == "" || owner == agvID {
		r.edgeLocks[edgeID] = agvID
		return true
	}
	return false
}

// UnlockEdge releases ownership of an edge if owned by the specified AGV.
func (r *ResourceRegistry) UnlockEdge(edgeID, agvID string) {
	if edgeID == "" || agvID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if owner, exists := r.edgeLocks[edgeID]; exists && owner == agvID {
		delete(r.edgeLocks, edgeID)
	}
}

// IsEdgeLocked checks if an edge is currently locked and returns the owner AGV ID.
func (r *ResourceRegistry) IsEdgeLocked(edgeID string) (bool, string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	owner, exists := r.edgeLocks[edgeID]
	return exists && owner != "", owner
}

// ReleaseAllByAGV releases all node and edge locks currently held by a given AGV.
// Useful upon mission completion, order cancellation, or emergency stop.
func (r *ResourceRegistry) ReleaseAllByAGV(agvID string) {
	if agvID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for nodeID, owner := range r.nodeLocks {
		if owner == agvID {
			delete(r.nodeLocks, nodeID)
		}
	}

	for edgeID, owner := range r.edgeLocks {
		if owner == agvID {
			delete(r.edgeLocks, edgeID)
		}
	}
}

// GetSnapshot returns a copy of all current node and edge locks for telemetry/debugging.
func (r *ResourceRegistry) GetSnapshot() (map[string]string, map[string]string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	nodeCopy := make(map[string]string, len(r.nodeLocks))
	for k, v := range r.nodeLocks {
		nodeCopy[k] = v
	}

	edgeCopy := make(map[string]string, len(r.edgeLocks))
	for k, v := range r.edgeLocks {
		edgeCopy[k] = v
	}

	return nodeCopy, edgeCopy
}
