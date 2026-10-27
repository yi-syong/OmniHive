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
	getCurrentState     func() model.WsStateUpdateMessage
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

			// Immediately push current state to the newly connected client
			if h.getCurrentState != nil {
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
		default:
			log.Printf("[WS] Received unhandled message type %s: %s", baseMsg.Type, string(message))
		}
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
