package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

type EventType string

const (
	EventNewMessage    EventType = "new_message"
	EventEditMessage   EventType = "edit_message"
	EventDeleteMessage EventType = "delete_message"
	EventTyping        EventType = "typing"
	EventOnline        EventType = "online"
	EventOffline       EventType = "offline"
	EventReadReceipt   EventType = "read_receipt"
	EventChatCreated   EventType = "chat_created"
	EventMemberJoined  EventType = "member_joined"
	EventMemberLeft    EventType = "member_left"
	EventCallIncoming  EventType = "call_incoming"
	EventCallAccepted  EventType = "call_accepted"
	EventCallEnded     EventType = "call_ended"
	EventCallICE           EventType = "call_ice"
	EventCallRenegotiate   EventType = "call_renegotiate"
	EventBotMessage    EventType = "bot_message"
	EventPong          EventType = "pong"
	EventReactionUpdate EventType = "reaction_update"
	EventChatUpdated   EventType = "chat_updated"
	EventOnlineStatus  EventType = "online_status"
	EventGroupCallUpdate EventType = "group_call_update"
)

type Event struct {
	Type    EventType       `json:"type"`
	ChatID  uuid.UUID       `json:"chat_id,omitempty"`
	UserID  uuid.UUID       `json:"user_id,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

type Hub struct {
	mu          sync.RWMutex
	clients     map[uuid.UUID]map[*Client]bool // userID -> set of clients
	chatMembers map[uuid.UUID][]uuid.UUID      // chatID -> list of userIDs
	register    chan *Client
	unregister  chan *Client
	broadcast   chan *Event
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[uuid.UUID]map[*Client]bool),
		chatMembers: make(map[uuid.UUID][]uuid.UUID),
		register:    make(chan *Client, 256),
		unregister:  make(chan *Client, 256),
		broadcast:   make(chan *Event, 4096),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			wasOffline := len(h.clients[client.UserID]) == 0
			if h.clients[client.UserID] == nil {
				h.clients[client.UserID] = make(map[*Client]bool)
			}
			h.clients[client.UserID][client] = true
			h.mu.Unlock()
			log.Printf("[WS] User %s connected (total connections: %d)", client.UserID, len(h.clients[client.UserID]))
			if wasOffline {
				h.broadcastOnline(client.UserID)
				h.broadcastOnlineStatus(client.UserID, true, "")
			}

		case client := <-h.unregister:
			h.mu.Lock()
			nowOffline := false
			if conns, ok := h.clients[client.UserID]; ok {
				nowOffline = len(conns) == 1
				delete(conns, client)
				if len(conns) == 0 {
					delete(h.clients, client.UserID)
				}
			}
			h.mu.Unlock()
			if nowOffline {
				h.broadcastOffline(client.UserID)
			}
			close(client.Send)
			log.Printf("[WS] User %s disconnected", client.UserID)

		case event := <-h.broadcast:
			h.handleBroadcast(event)
		}
	}
}

func (h *Hub) handleBroadcast(event *Event) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("[WS] marshal error: %v", err)
		return
	}

	if event.ChatID != uuid.Nil {
		h.mu.RLock()
		members := h.chatMembers[event.ChatID]
		h.mu.RUnlock()

		for _, uid := range members {
			h.sendToUser(uid, data)
		}
	} else if event.UserID != uuid.Nil {
		h.sendToUser(event.UserID, data)
	}
}

func (h *Hub) sendToUser(userID uuid.UUID, data []byte) {
	h.mu.RLock()
	conns := h.clients[userID]
	h.mu.RUnlock()

	for client := range conns {
		select {
		case client.Send <- data:
		default:
			h.unregister <- client
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

func (h *Hub) Broadcast(event *Event) {
	h.broadcast <- event
}

// SendToUser доставляет событие конкретному пользователю (все его сессии).
// ChatID в событии обнуляем: иначе handleBroadcast уйдёт в ветку по chatMembers[],
// которая по умолчанию пуста — сообщения не доходят. chat_id остаётся внутри payload JSON.
func (h *Hub) SendToUser(userID uuid.UUID, event *Event) {
	event.UserID = userID
	event.ChatID = uuid.Nil
	h.broadcast <- event
}

func (h *Hub) SendToChat(chatID uuid.UUID, event *Event) {
	event.ChatID = chatID
	h.broadcast <- event
}

func (h *Hub) UpdateChatMembers(chatID uuid.UUID, members []uuid.UUID) {
	h.mu.Lock()
	h.chatMembers[chatID] = members
	h.mu.Unlock()
}

func (h *Hub) AddChatMember(chatID, userID uuid.UUID) {
	h.mu.Lock()
	h.chatMembers[chatID] = append(h.chatMembers[chatID], userID)
	h.mu.Unlock()
}

func (h *Hub) broadcastOnline(userID uuid.UUID) {
	payload, _ := json.Marshal(map[string]interface{}{"user_id": userID.String()})
	ev := &Event{Type: EventOnline, UserID: userID, Payload: payload}
	data, _ := json.Marshal(ev)
	h.mu.RLock()
	for uid, conns := range h.clients {
		if uid != userID {
			for c := range conns {
				select {
				case c.Send <- data:
				default:
					h.unregister <- c
				}
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) broadcastOffline(userID uuid.UUID) {
	lastSeen := time.Now().UTC().Format(time.RFC3339Nano)
	payload, _ := json.Marshal(map[string]interface{}{
		"user_id":    userID.String(),
		"last_seen": lastSeen,
	})
	ev := &Event{Type: EventOffline, UserID: userID, Payload: payload}
	data, _ := json.Marshal(ev)
	h.mu.RLock()
	for uid, conns := range h.clients {
		if uid != userID {
			for c := range conns {
				select {
				case c.Send <- data:
				default:
					h.unregister <- c
				}
			}
		}
	}
	h.mu.RUnlock()
	h.broadcastOnlineStatus(userID, false, lastSeen)
}

// broadcastOnlineStatus — ТЗ §37: единое событие online + last_seen для клиентов.
func (h *Hub) broadcastOnlineStatus(userID uuid.UUID, online bool, lastSeen string) {
	p := map[string]interface{}{"user_id": userID.String(), "online": online}
	if lastSeen != "" {
		p["last_seen"] = lastSeen
	}
	payload, _ := json.Marshal(p)
	ev := &Event{Type: EventOnlineStatus, UserID: userID, Payload: payload}
	data, _ := json.Marshal(ev)
	h.mu.RLock()
	for uid, conns := range h.clients {
		if uid != userID {
			for c := range conns {
				select {
				case c.Send <- data:
				default:
					h.unregister <- c
				}
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[userID]) > 0
}

func (h *Hub) OnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
