package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yi-syong/OmniHive/internal/master/db"
	"github.com/yi-syong/OmniHive/internal/master/store"
	"github.com/yi-syong/OmniHive/internal/master/websocket"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	testDB, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test db: %v", err)
	}

	if err := testDB.AutoMigrate(&db.Map{}, &db.Node{}, &db.Edge{}); err != nil {
		t.Fatalf("Failed to migrate test db: %v", err)
	}

	db.DB = testDB // Override global DB
	return testDB
}

func setupTestRouter(t *testing.T) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	s := store.New(30 * time.Second)
	hub := websocket.NewHub()

	handler := NewHandler(s, hub, nil)
	handler.SetupRoutes(router)

	return router
}

func TestMapAPIs(t *testing.T) {
	setupTestDB(t)
	router := setupTestRouter(t)

	// Ensure uploads dir exists for testing
	os.MkdirAll("../../uploads", os.ModePerm)
	defer os.RemoveAll("../../uploads")

	// 1. Upload Map
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("name", "Test Factory")
	part, _ := writer.CreateFormFile("image", "test_map.png")
	part.Write([]byte("fake image data"))
	writer.Close()

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/maps", body)
	req.Header.Add("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var m db.Map
	json.Unmarshal(w.Body.Bytes(), &m)
	if m.Name != "Test Factory" {
		t.Errorf("Expected name 'Test Factory', got %s", m.Name)
	}

	mapID := m.ID

	// 2. Calibrate Map
	calibrateReq := map[string]interface{}{
		"metersPerPixel": 0.05,
	}
	calibrateBody, _ := json.Marshal(calibrateReq)
	req, _ = http.NewRequest(http.MethodPut, "/api/v1/maps/"+strconv.Itoa(int(mapID))+"/calibrate", bytes.NewBuffer(calibrateBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	var updatedMap db.Map
	json.Unmarshal(w.Body.Bytes(), &updatedMap)
	if updatedMap.MetersPerPixel != 0.05 {
		t.Errorf("Expected MetersPerPixel 0.05, got %f", updatedMap.MetersPerPixel)
	}
}

func TestNetworkAPIs(t *testing.T) {
	setupTestDB(t)
	router := setupTestRouter(t)

	// Setup a Map first
	testMap := db.Map{Name: "Network Test Map"}
	db.DB.Create(&testMap)

	// 1. Create Node
	nodeReq := map[string]interface{}{
		"mapId":  testMap.ID,
		"nodeId": "N1",
		"x":      10.5,
		"y":      20.5,
	}
	body, _ := json.Marshal(nodeReq)
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/network/nodes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var createdNode db.Node
	json.Unmarshal(w.Body.Bytes(), &createdNode)
	if createdNode.NodeID != "N1" {
		t.Errorf("Expected NodeID 'N1', got %s", createdNode.NodeID)
	}

	// Create another Node directly
	node2 := db.Node{MapID: testMap.ID, NodeID: "N2", X: 30, Y: 40}
	db.DB.Create(&node2)

	// 2. Create Edge
	edgeReq := map[string]interface{}{
		"mapId":       testMap.ID,
		"edgeId":      "E1",
		"startNodeId": "N1",
		"endNodeId":   "N2",
		"direction":   "bidirectional",
		"maxSpeed":    1.5,
	}
	body, _ = json.Marshal(edgeReq)
	req, _ = http.NewRequest(http.MethodPost, "/api/v1/network/edges", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Get Network
	req, _ = http.NewRequest(http.MethodGet, "/api/v1/network?mapId="+strconv.Itoa(int(testMap.ID)), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	var response struct {
		Nodes []db.Node `json:"nodes"`
		Edges []db.Edge `json:"edges"`
	}
	json.Unmarshal(w.Body.Bytes(), &response)

	if len(response.Nodes) != 2 {
		t.Errorf("Expected 2 nodes, got %d", len(response.Nodes))
	}
	if len(response.Edges) != 1 {
		t.Errorf("Expected 1 edge, got %d", len(response.Edges))
	}
}
