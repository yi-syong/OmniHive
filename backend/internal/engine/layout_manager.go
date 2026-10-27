package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"omnihive/backend/internal/model"
)

type LayoutManager struct {
	mu         sync.RWMutex
	filePath   string
	layout     model.FactoryLayout
	nodeMap    map[string]model.LayoutNode
	adjList    map[string][]string // startNode -> []endNode
	edgeIdMap  map[string]string   // "startNode_endNode" -> edgeId
}

func NewLayoutManager(storagePath string) (*LayoutManager, error) {
	if storagePath == "" {
		storagePath = "factory_layout.json"
	}

	lm := &LayoutManager{
		filePath:  storagePath,
		nodeMap:   make(map[string]model.LayoutNode),
		adjList:   make(map[string][]string),
		edgeIdMap: make(map[string]string),
	}

	// Try loading from file
	if err := lm.loadFromFile(); err != nil {
		log.Printf("[Layout] No existing layout found or parse error (%v). Initializing default layout.", err)
		lm.initDefaultLayout()
		if err := lm.saveToFile(); err != nil {
			log.Printf("[Layout WARNING] Failed to persist default layout: %v", err)
		}
	} else {
		log.Printf("[Layout] Successfully loaded factory layout from %s (%d nodes, %d edges, %d props)",
			storagePath, len(lm.layout.Nodes), len(lm.layout.Edges), len(lm.layout.Props))
	}

	lm.rebuildIndices()
	return lm, nil
}

func (lm *LayoutManager) initDefaultLayout() {
	lm.layout = model.FactoryLayout{
		Version: "2.0.0",
		Nodes: []model.LayoutNode{
			{
				ID:          "Node-01",
				Name:        "待命/充電區",
				X:           0.0,
				Y:           0.0,
				Z:           0.0,
				Function:    "Idle/Charge",
				Description: "AGV 待命與自動充電樁",
			},
			{
				ID:          "Node-02",
				Name:        "路徑轉折點",
				X:           10.0,
				Y:           0.0,
				Z:           0.0,
				Function:    "Transit",
				Description: "主幹道路徑交會轉折點",
			},
			{
				ID:          "Node-03",
				Name:        "取貨區",
				X:           10.0,
				Y:           0.0,
				Z:           10.0,
				Function:    "Pick-up",
				Description: "智慧貨架取貨作業區",
			},
			{
				ID:          "Node-04",
				Name:        "卸貨區",
				X:           0.0,
				Y:           0.0,
				Z:           10.0,
				Function:    "Drop-off",
				Description: "入庫輸送帶卸貨區",
			},
		},
		Edges: []model.LayoutEdge{
			{ID: "Edge-01-02", StartNodeID: "Node-01", EndNodeID: "Node-02"},
			{ID: "Edge-02-03", StartNodeID: "Node-02", EndNodeID: "Node-03"},
			{ID: "Edge-03-04", StartNodeID: "Node-03", EndNodeID: "Node-04"},
			{ID: "Edge-04-01", StartNodeID: "Node-04", EndNodeID: "Node-01"},
		},
		Props: []model.LayoutProp{
			{
				ID:        "Pillar-01",
				ModelType: "pillar",
				X:         -1.2,
				Y:         0.8,
				Z:         0.0,
				RotationY: 0.0,
				Scale:     1.0,
			},
			{
				ID:        "Rack-01",
				ModelType: "rack",
				X:         11.4,
				Y:         0.0,
				Z:         10.0,
				RotationY: 0.0,
				Scale:     1.0,
			},
			{
				ID:        "Conveyor-01",
				ModelType: "workstation",
				X:         -1.4,
				Y:         0.2,
				Z:         10.0,
				RotationY: 0.0,
				Scale:     1.0,
			},
		},
	}
}

func (lm *LayoutManager) loadFromFile() error {
	data, err := os.ReadFile(lm.filePath)
	if err != nil {
		return err
	}

	var l model.FactoryLayout
	if err := json.Unmarshal(data, &l); err != nil {
		return err
	}

	if len(l.Nodes) == 0 {
		return errors.New("layout contains no nodes")
	}

	lm.layout = l
	return nil
}

func (lm *LayoutManager) saveToFile() error {
	dir := filepath.Dir(lm.filePath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}

	data, err := json.MarshalIndent(lm.layout, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(lm.filePath, data, 0644)
}

func (lm *LayoutManager) rebuildIndices() {
	lm.nodeMap = make(map[string]model.LayoutNode)
	lm.adjList = make(map[string][]string)
	lm.edgeIdMap = make(map[string]string)

	for _, n := range lm.layout.Nodes {
		lm.nodeMap[n.ID] = n
	}

	for _, e := range lm.layout.Edges {
		lm.adjList[e.StartNodeID] = append(lm.adjList[e.StartNodeID], e.EndNodeID)
		key := fmt.Sprintf("%s_%s", e.StartNodeID, e.EndNodeID)
		lm.edgeIdMap[key] = e.ID

		// If bidirectional, allow reverse traversal
		if e.Bidirectional {
			lm.adjList[e.EndNodeID] = append(lm.adjList[e.EndNodeID], e.StartNodeID)
			revKey := fmt.Sprintf("%s_%s", e.EndNodeID, e.StartNodeID)
			lm.edgeIdMap[revKey] = e.ID
		}
	}
}

// GetLayout returns a copy of current layout
func (lm *LayoutManager) GetLayout() model.FactoryLayout {
	lm.mu.RLock()
	defer lm.mu.RUnlock()
	return lm.layout
}

// SaveLayout validates, updates in-memory layout, and persists to JSON file
func (lm *LayoutManager) SaveLayout(newLayout model.FactoryLayout) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if len(newLayout.Nodes) == 0 {
		return errors.New("場域配置必須包含至少一個節點")
	}

	if newLayout.Version == "" {
		newLayout.Version = "2.0.0"
	}

	lm.layout = newLayout
	lm.rebuildIndices()

	return lm.saveToFile()
}

// ReloadFromFile re-reads the JSON file from disk and updates indices
func (lm *LayoutManager) ReloadFromFile() error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if err := lm.loadFromFile(); err != nil {
		return err
	}
	lm.rebuildIndices()
	log.Printf("[Layout] Reloaded layout from %s (%d nodes, %d edges)",
		lm.filePath, len(lm.layout.Nodes), len(lm.layout.Edges))
	return nil
}

// GetNode returns node info by ID
func (lm *LayoutManager) GetNode(id string) (model.LayoutNode, bool) {
	lm.mu.RLock()
	defer lm.mu.RUnlock()
	n, ok := lm.nodeMap[id]
	return n, ok
}

// FindPath finds the shortest sequence of nodes and edges connecting startNodeID to targetNodeID using BFS
func (lm *LayoutManager) FindPath(startNodeID, targetNodeID string) ([]model.LayoutNode, []string, error) {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	if _, ok := lm.nodeMap[startNodeID]; !ok {
		return nil, nil, fmt.Errorf("起點節點 %s 不存在於目前已儲存的場域中（請確認場域是否已儲存）", startNodeID)
	}
	if _, ok := lm.nodeMap[targetNodeID]; !ok {
		return nil, nil, fmt.Errorf("目標節點 %s 不存在於目前已儲存的場域中（請確認場域是否已儲存）", targetNodeID)
	}

	if startNodeID == targetNodeID {
		return []model.LayoutNode{}, []string{}, nil
	}

	// BFS for shortest path in directed graph
	type queueItem struct {
		currNode string
		path     []string
	}

	queue := []queueItem{{currNode: startNodeID, path: []string{startNodeID}}}
	visited := map[string]bool{startNodeID: true}

	var foundPath []string

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		if curr.currNode == targetNodeID {
			foundPath = curr.path
			break
		}

		for _, neighbor := range lm.adjList[curr.currNode] {
			if !visited[neighbor] {
				visited[neighbor] = true
				newPath := append([]string{}, curr.path...)
				newPath = append(newPath, neighbor)
				queue = append(queue, queueItem{currNode: neighbor, path: newPath})
			}
		}
	}

	if len(foundPath) == 0 {
		return nil, nil, fmt.Errorf("目標節點 %s 在目前路網中與起點 %s 無可通行連線（請檢查路網連線或單向設定）", targetNodeID, startNodeID)
	}

	// Construct waypoints (excluding start node) and edge IDs
	var waypoints []model.LayoutNode
	var edgeIDs []string

	for i := 1; i < len(foundPath); i++ {
		prevID := foundPath[i-1]
		currID := foundPath[i]

		node := lm.nodeMap[currID]
		waypoints = append(waypoints, node)

		key := fmt.Sprintf("%s_%s", prevID, currID)
		edgeID, exists := lm.edgeIdMap[key]
		if !exists {
			edgeID = fmt.Sprintf("Edge-%s-%s", prevID, currID)
		}
		edgeIDs = append(edgeIDs, edgeID)
	}

	return waypoints, edgeIDs, nil
}
