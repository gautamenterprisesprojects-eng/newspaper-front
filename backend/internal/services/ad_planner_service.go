package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type AdPlannerService struct {
	DB *sqlx.DB
}

type PagePlanSlot struct {
	ID            uuid.UUID `db:"id" json:"id"`
	EditionID     uuid.UUID `db:"edition_id" json:"edition_id"`
	IssueDate     string    `db:"issue_date" json:"issue_date"`
	PageNumber    int       `db:"page_number" json:"page_number"`
	SlotType      string    `db:"slot_type" json:"slot_type"` // ADVERT, ARTICLE_STORY, MASTHEAD_FIXED
	StartColumn   int       `db:"start_column" json:"start_column"`
	StartHeightCm float64   `db:"start_height_cm" json:"start_height_cm"`
	WidthColumns  int       `db:"width_columns" json:"width_columns"`
	HeightCm      float64   `db:"height_cm" json:"height_cm"`
	IsLocked      bool      `db:"is_locked" json:"is_locked"`
}

// CheckGeometricCollision evaluates if a requested ad or article placement overlaps with existing confirmed slots
func (aps *AdPlannerService) CheckGeometricCollision(ctx context.Context, editionID uuid.UUID, issueDate string, pageNum int, newCol int, newY float64, newW int, newH float64) error {
	// Standard broadsheet boundary verification (8 Columns Wide x 54.0 cm High)
	if newCol < 1 || (newCol+newW-1) > 8 {
		return fmt.Errorf("ERR_GRID_OUT_OF_BOUNDS: requested width columns [%d to %d] exceeds standard 8-column newspaper grid", newCol, newCol+newW-1)
	}
	if newY < 0.0 || (newY+newH) > 54.0 {
		return fmt.Errorf("ERR_GRID_OUT_OF_BOUNDS: requested vertical space [%.2f to %.2f cm] exceeds maximum 54.0 cm page height", newY, newY+newH)
	}

	query := `SELECT id, start_column, start_height_cm, width_columns, height_cm, slot_type 
              FROM page_plan_slots 
              WHERE edition_id = $1 AND issue_date = $2 AND page_number = $3 AND is_locked = TRUE`

	var existing []PagePlanSlot
	if err := aps.DB.SelectContext(ctx, &existing, query, editionID, issueDate, pageNum); err != nil {
		return fmt.Errorf("failed to query existing page grid slots: %w", err)
	}

	// Geometric Intersection Algorithm:
	// Two geometric rectangles overlap IF AND ONLY IF both horizontal axis and vertical axis intersect simultaneously.
	for _, slot := range existing {
		horizIntersect := (newCol < slot.StartColumn+slot.WidthColumns) && (newCol+newW > slot.StartColumn)
		vertIntersect := (newY < slot.StartHeightCm+slot.HeightCm) && (newY+newH > slot.StartHeightCm)

		if horizIntersect && vertIntersect {
			return fmt.Errorf("ERR_GRID_COLLISION_DETECTED: placement collides with existing locked [%s] on Page %d at coordinates (Col %d, Height %.1fcm)", slot.SlotType, pageNum, slot.StartColumn, slot.StartHeightCm)
		}
	}

	return nil
}

// ReserveSlot atomically verifies grid availability and inserts confirmed advertisement slot booking
func (aps *AdPlannerService) ReserveSlot(ctx context.Context, editionID uuid.UUID, issueDate string, pageNum int, slotType string, col int, y float64, w int, h float64) (*PagePlanSlot, error) {
	if aps.DB == nil {
		return nil, errors.New("database connection pool not initialized")
	}

	tx, err := aps.DB.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Execute real-time mathematical collision check
	if err := aps.CheckGeometricCollision(ctx, editionID, issueDate, pageNum, col, y, w, h); err != nil {
		return nil, err
	}

	slot := &PagePlanSlot{
		ID:            uuid.New(),
		EditionID:     editionID,
		IssueDate:     issueDate,
		PageNumber:    pageNum,
		SlotType:      slotType,
		StartColumn:   col,
		StartHeightCm: y,
		WidthColumns:  w,
		HeightCm:      h,
		IsLocked:      true,
	}

	ins := `INSERT INTO page_plan_slots (id, edition_id, issue_date, page_number, slot_type, start_column, start_height_cm, width_columns, height_cm, is_locked)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`

	if _, err := tx.ExecContext(ctx, ins, slot.ID, slot.EditionID, slot.IssueDate, slot.PageNumber, slot.SlotType, slot.StartColumn, slot.StartHeightCm, slot.WidthColumns, slot.HeightCm); err != nil {
		return nil, fmt.Errorf("failed to reserve page layout slot: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return slot, nil
}
