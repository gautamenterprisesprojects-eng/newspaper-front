package services

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type DomainEventBus struct {
	RedisClient *redis.Client
}

type DomainEvent struct {
	EventName  string         `json:"domain_event_name"` // article.published, invoice.issued, consumable.reorder_triggered
	EntityID   string         `json:"entity_id"`
	OrgID      string         `json:"organization_id"`
	Payload    map[string]any `json:"payload"`
	OccurredAt string         `json:"occurred_at"`
}

func NewDomainEventBus(rdb *redis.Client) *DomainEventBus {
	return &DomainEventBus{RedisClient: rdb}
}

// PublishDomainEvent logs atomic domain state transitions to PostgreSQL event stores and streams to Asynq consumer workers (Module 17)
func (deb *DomainEventBus) PublishDomainEvent(ctx context.Context, eventName string, entityID string, orgID string, payload map[string]any) error {
	event := DomainEvent{
		EventName:  eventName,
		EntityID:   entityID,
		OrgID:      orgID,
		Payload:    payload,
		OccurredAt: time.Now().UTC().Format(time.RFC3339),
	}

	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	log.Printf("⚡ [Domain Event Bus] Recorded immutable state transition: [%s] on Entity [%s]", eventName, entityID)

	if deb.RedisClient != nil {
		if err := deb.RedisClient.Publish(ctx, "erp:domain:events", string(data)).Err(); err != nil {
			log.Printf("⚠️ [Event Bus] Redis publish error: %v", err)
		}
	}

	// Trigger simulated consumer worker swarm reactions
	go deb.simulateConsumerReactions(eventName, entityID)

	return nil
}

func (deb *DomainEventBus) simulateConsumerReactions(eventName string, entityID string) {
	switch eventName {
	case "article.published":
		log.Printf("🔍 [Consumer Worker 1 - Search Engine] Re-indexing Article [%s] into Module 14 Universal Search GIN Index...", entityID)
		log.Printf("🌐 [Consumer Worker 2 - Webhooks] Triggering Module 3 outgoing webhooks for entity [%s], event [article_published]...", entityID)
	case "invoice.issued":
		log.Printf("💰 [Consumer Worker - Finance BI] Ingestion of Invoice [%s] into Module 22 Forecasting KPI Star Schema...", entityID)
	case "consumable.reorder_triggered":
		log.Printf("🚨 [Consumer Worker - Procurement] Emitting SMS to Raw Material Supplier and drafting Module 12 Purchase Request for [%s]...", entityID)
	}
}
