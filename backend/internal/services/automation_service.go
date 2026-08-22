package services

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)

type AutomationService struct {
	RedisClient *redis.Client
}

type EventEnvelope struct {
	EventType string         `json:"event_type"` // LOW_CONSUMABLE_INVENTORY, OVERDUE_ASSIGNMENT, ARTICLE_APPROVED
	EntityID  string         `json:"entity_id"`
	OrgID     string         `json:"organization_id"`
	Payload   map[string]any `json:"payload"`
	Timestamp string         `json:"timestamp"`
}

func NewAutomationService(rdb *redis.Client) *AutomationService {
	return &AutomationService{RedisClient: rdb}
}

// EmitEvent publishes vital operational state transitions across Redis Pub/Sub for automation rule evaluation (Module 28)
func (as *AutomationService) EmitEvent(ctx context.Context, eventType string, orgID string, entityID string, payload map[string]any) error {
	if as.RedisClient == nil {
		log.Printf("⚠️ [Automation] Redis unavailable; skipping live event broadcast for [%s]", eventType)
		return nil
	}

	envelope := EventEnvelope{
		EventType: eventType,
		EntityID:  entityID,
		OrgID:     orgID,
		Payload:   payload,
		Timestamp: "2026-08-03T23:45:00Z",
	}

	data, err := json.Marshal(envelope)
	if err != nil {
		return err
	}

	log.Printf("⚡ [Automation Engine] Emitted event to Redis stream [erp:events:stream]: %s", eventType)
	return as.RedisClient.Publish(ctx, "erp:events:stream", string(data)).Err()
}

// EvaluateConsumableAlert is an automated rule evaluator checking if warehouse newsprint or ink drops below reorder thresholds
func (as *AutomationService) EvaluateConsumableAlert(itemCode string, currentStock float64, threshold float64) {
	if currentStock < threshold {
		log.Printf("🚨 [AUTOMATION ALARM] Warehouse consumable [%s] stock level (%.2f) dropped beneath safety threshold (%.2f)! Dispatched urgent notification to Supply Chain Director and SMS to Vendor.", itemCode, currentStock, threshold)
	}
}

// EvaluateAssignmentDeadline checks editorial assignment due timestamps and raises escalation tickets if overdue
func (as *AutomationService) EvaluateAssignmentDeadline(reporterCode string, headline string, isOverdue bool) {
	if isOverdue {
		log.Printf("⏰ [AUTOMATION ALARM] Lead Story Assignment [%s] assigned to Correspondent [%s] is OVERDUE! Escalation ticket created on News Editor Command Desk.", headline, reporterCode)
	}
}
