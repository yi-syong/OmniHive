package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"omnihive/backend/internal/model"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow cross-origin for local dev
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

type Hub struct {
	clients             map[*Client]bool
	broadcast           chan []byte
	register            chan *Client
	unregister          chan *Client
	mu                  sync.RWMutex
	onOrderReceived     func(msg model.WsDispatchOrderMessage)
	onTimeScaleReceived func(scale float64)
	onStrategyReceived  func(strategy string)
	onCancelReceived    func(agvID, reason string)
	onResetReceived     func()
	getCurrentState     func() model.WsStateUpdateMessage
	getInitialStates    func() []model.WsStateUpdateMessage
}

func (h *Hub) SetStrategyCallback(fn func(strategy string)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onStrategyReceived = fn
}

func (h *Hub) SetCancelCallback(fn func(agvID, reason string)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onCancelReceived = fn
}

func (h *Hub) SetResetCallback(fn func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onResetReceived = fn
}

func (h *Hub) SetInitialStatesProvider(fn func() []model.WsStateUpdateMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.getInitialStates = fn
}

func NewHub(onOrderReceived func(model.WsDispatchOrderMessage), onTimeScaleReceived func(float64), getCurrentState func() model.WsStateUpdateMessage) *Hub {
	return &Hub{
		clients:             make(map[*Client]bool),
		broadcast:           make(chan []byte, 256),
		register:            make(chan *Client),
		unregister:          make(chan *Client),
		onOrderReceived:     onOrderReceived,
		onTimeScaleReceived: onTimeScaleReceived,
		getCurrentState:     getCurrentState,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

			// Immediately push current fleet state to newly connected client
			if h.getInitialStates != nil {
				for _, state := range h.getInitialStates() {
					if data, err := json.Marshal(state); err == nil {
						select {
						case client.send <- data:
						default:
						}
					}
				}
			} else if h.getCurrentState != nil {
				initMsg := h.getCurrentState()
				if data, err := json.Marshal(initMsg); err == nil {
					select {
					case client.send <- data:
					default:
					}
				}
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastStateUpdate(msg model.WsStateUpdateMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	select {
	case h.broadcast <- data:
	default:
		// Queue full, drop frame to maintain 10Hz responsiveness
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS ERROR] Upgrade failed: %v", err)
		return
	}

	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 64),
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS ERROR] Read error: %v", err)
			}
			break
		}

		var baseMsg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(message, &baseMsg); err != nil {
			log.Printf("[WS WARNING] Could not parse message JSON: %v", err)
			continue
		}

		switch baseMsg.Type {
		case "dispatch_order":
			var dispatchMsg model.WsDispatchOrderMessage
			if err := json.Unmarshal(message, &dispatchMsg); err == nil {
				log.Printf("[WS] Received dispatch_order: AGV=%s, Target=%s, Action=%s",
					dispatchMsg.AgvID, dispatchMsg.TargetNode, dispatchMsg.Action)
				if c.hub.onOrderReceived != nil {
					c.hub.onOrderReceived(dispatchMsg)
				}
			}
		case "set_time_scale":
			var scaleMsg model.WsSetTimeScaleMessage
			if err := json.Unmarshal(message, &scaleMsg); err == nil {
				log.Printf("[WS] Received set_time_scale: %.1fx", scaleMsg.TimeScale)
				if c.hub.onTimeScaleReceived != nil {
					c.hub.onTimeScaleReceived(scaleMsg.TimeScale)
				}
			}
		case "set_traffic_strategy":
			var stratMsg struct {
				Strategy string `json:"strategy"`
			}
			if err := json.Unmarshal(message, &stratMsg); err == nil {
				log.Printf("[WS] Received set_traffic_strategy: %s", stratMsg.Strategy)
				if c.hub.onStrategyReceived != nil {
					c.hub.onStrategyReceived(stratMsg.Strategy)
				}
			}
		case "cancel_order":
			var cancelMsg struct {
				AgvID  string `json:"agv_id"`
				Reason string `json:"reason"`
			}
			if err := json.Unmarshal(message, &cancelMsg); err == nil {
				log.Printf("[WS] Received cancel_order: AGV=%s, Reason=%s", cancelMsg.AgvID, cancelMsg.Reason)
				if c.hub.onCancelReceived != nil {
					c.hub.onCancelReceived(cancelMsg.AgvID, cancelMsg.Reason)
				}
			}
		case "reset_fleet":
			log.Printf("[WS] Received reset_fleet")
			if c.hub.onResetReceived != nil {
				c.hub.onResetReceived()
			}
		default:
			log.Printf("[WS] Received unhandled message type %s: %s", baseMsg.Type, string(message))
		}
	}
}

// BroadcastJSON serializes any struct to JSON and broadcasts to all WebSocket clients
func (h *Hub) BroadcastJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case h.broadcast <- data:
	default:
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second) // Ping ticker
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Flush any pending messages queued in channel
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
