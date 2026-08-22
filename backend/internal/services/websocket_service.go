package services

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/redis/go-redis/v9"
)

type WebSocketManager struct {
	RedisClient *redis.Client
	Mu          sync.RWMutex
	Clients     map[string]*websocket.Conn // Mapped by job_id
}

type LiveProgressPayload struct {
	JobID         string  `json:"job_id"`
	Step          int     `json:"step"`
	State         string  `json:"state"` // PREPARING, COLLECTING_ASSETS, RENDERING_CMYK, COMPLETED, FAILED
	ProgressPct   int     `json:"progress_pct"`
	Description   string  `json:"description"`
	PDFResultURL  string  `json:"pdf_result_url,omitempty"`
	WalletDebited float64 `json:"wallet_debited,omitempty"`
	Timestamp     string  `json:"timestamp"`
}

func NewWebSocketManager(rdb *redis.Client) *WebSocketManager {
	return &WebSocketManager{
		RedisClient: rdb,
		Clients:     make(map[string]*websocket.Conn),
	}
}

// UpgradeHandler ensures HTTP requests requesting live status stream upgrade properly to WebSockets
func (wm *WebSocketManager) UpgradeHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			jobID := c.Query("job_id", "demo_live_job_01")
			c.Locals("job_id", jobID)
			return c.Next()
		}
		return c.Status(fiber.StatusUpgradeRequired).JSON(fiber.Map{
			"success":    false,
			"error_code": "ERR_WEBSOCKET_UPGRADE_REQUIRED",
			"message":    "This endpoint mandates an HTTP Upgrade header to switch to WebSocket protocol",
		})
	}
}

// StreamLiveStatus establishes duplex real-time socket and binds Redis Pub/Sub topic to stream progress to Next.js UI
func (wm *WebSocketManager) StreamLiveStatus() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		jobID := conn.Locals("job_id").(string)
		wm.Mu.Lock()
		wm.Clients[jobID] = conn
		wm.Mu.Unlock()

		defer func() {
			wm.Mu.Lock()
			delete(wm.Clients, jobID)
			wm.Mu.Unlock()
			conn.Close()
		}()

		log.Printf("🔌 [WS] New publisher client connected for Live Generation Job: %s", jobID)

		// Subscribe to Redis Pub/Sub Channel for this specific job execution
		ctx := context.Background()
		pubsub := wm.RedisClient.Subscribe(ctx, "ws:pubsub:gen_job:"+jobID)
		defer pubsub.Close()

		ch := pubsub.Channel()

		// Simultaneously emit immediate handshake confirmation envelope
		handshake := LiveProgressPayload{
			JobID:       jobID,
			Step:        0,
			State:       "CONNECTED",
			ProgressPct: 0,
			Description: "WebSocket live pipeline connected. Awaiting background Asynq worker pickup...",
			Timestamp:   time.Now().UTC().Format(time.RFC3339),
		}
		if data, err := json.Marshal(handshake); err == nil {
			conn.WriteMessage(websocket.TextMessage, data)
		}

		// Listen loop for Redis broadcasts from Asynq Workers
		for msg := range ch {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				log.Printf("❌ [WS] Write failure to socket client %s: %v", jobID, err)
				break
			}
		}
	})
}

// BroadcastStep (Utility invoked by background workers to emit progress across Redis Pub/Sub)
func (wm *WebSocketManager) BroadcastStep(ctx context.Context, jobID string, step int, state string, progress int, desc string, pdfURL string, debited float64) error {
	payload := LiveProgressPayload{
		JobID:         jobID,
		Step:          step,
		State:         state,
		ProgressPct:   progress,
		Description:   desc,
		PDFResultURL:  pdfURL,
		WalletDebited: debited,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
	}
	bytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return wm.RedisClient.Publish(ctx, "ws:pubsub:gen_job:"+jobID, string(bytes)).Err()
}
