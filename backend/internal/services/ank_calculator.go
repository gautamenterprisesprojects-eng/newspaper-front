package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type AnkCalculatorService struct {
	DB *sqlx.DB
}

type NewspaperSettings struct {
	ID                 uuid.UUID `db:"id"`
	OrganizationID     uuid.UUID `db:"organization_id"`
	NewspaperName      string    `db:"newspaper_name"`
	PublicationType    string    `db:"publication_type"` // DAILY or WEEKLY
	PublicationDay     string    `db:"publication_day"`  // MONDAY... or ALL
	DefaultIssueNumber int       `db:"default_issue_number"`
	IssuePrefix        string    `db:"issue_prefix"`
	DefaultPageCount   int       `db:"default_page_count"`
	IsLocked           bool      `db:"is_locked"`
}

type IssueMetadata struct {
	IssueNumber   int       `json:"issue_number"`
	IssuePrefix   string    `json:"issue_prefix"`
	IssueDate     string    `json:"issue_date"`
	FormattedName string    `json:"formatted_name"`
	PageCount     int       `json:"page_count"`
	NewspaperID   uuid.UUID `json:"newspaper_id"`
}

// CalculateAndLockNextIssue performs atomic issue Ank sequencing with strict schedule and concurrency guards.
func (a *AnkCalculatorService) CalculateAndLockNextIssue(ctx context.Context, orgID uuid.UUID, targetDate time.Time, isSpecialEdition bool) (*IssueMetadata, error) {
	tx, err := a.DB.BeginTxx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, fmt.Errorf("failed to open tx: %w", err)
	}
	defer tx.Rollback()

	var nw NewspaperSettings
	query := `SELECT id, organization_id, newspaper_name, publication_type, publication_day, 
                     default_issue_number, issue_prefix, default_page_count, is_locked
              FROM newspapers WHERE organization_id = $1 FOR UPDATE`
	if err := tx.GetContext(ctx, &nw, query, orgID); err != nil {
		return nil, fmt.Errorf("newspaper settings lookup & lock failed: %w", err)
	}

	if nw.IsLocked {
		return nil, errors.New("issue counter is explicitly LOCKED by system admin; publishing suspended")
	}

	// Verify Weekly publication schedule compliance
	if nw.PublicationType == "WEEKLY" && !isSpecialEdition {
		targetDayStr := strings.ToUpper(targetDate.Format("Monday"))
		if nw.PublicationDay != "ALL" && nw.PublicationDay != targetDayStr {
			return nil, fmt.Errorf("weekly schedule breach: newspaper %s is scheduled for %s, but requested generation date is %s", nw.NewspaperName, nw.PublicationDay, targetDayStr)
		}
	}

	dateFormatted := targetDate.Format("2006-01-02")

	// Verify Duplicate Date Guard
	if !isSpecialEdition {
		var count int
		chk := `SELECT COUNT(1) FROM generation_history WHERE newspaper_id = $1 AND issue_date = $2 AND status IN ('SUCCESS', 'PROCESSING')`
		if err := tx.GetContext(ctx, &count, chk, nw.ID, dateFormatted); err != nil || count > 0 {
			return nil, fmt.Errorf("duplicate issue error: an issue for date %s has already been generated or is actively in worker processing", dateFormatted)
		}
	}

	currentAnk := nw.DefaultIssueNumber
	nextAnk := currentAnk
	if !isSpecialEdition {
		nextAnk = currentAnk + 1
		// Advance Ank counter in Database securely within this atomic lock
		if _, err := tx.ExecContext(ctx, `UPDATE newspapers SET default_issue_number = $1, updated_at = NOW() WHERE id = $2`, nextAnk, nw.ID); err != nil {
			return nil, fmt.Errorf("failed to increment ank sequence in db: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit failed during auto-issue numbering: %w", err)
	}

	return &IssueMetadata{
		IssueNumber:   currentAnk,
		IssuePrefix:   nw.IssuePrefix,
		IssueDate:     dateFormatted,
		FormattedName: fmt.Sprintf("%s %d", nw.IssuePrefix, currentAnk),
		PageCount:     nw.DefaultPageCount,
		NewspaperID:   nw.ID,
	}, nil
}
