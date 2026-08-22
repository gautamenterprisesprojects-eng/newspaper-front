package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type LicenseService struct {
	DB *sqlx.DB
}

type License struct {
	ID                     uuid.UUID `db:"id"`
	OrganizationID         uuid.UUID `db:"organization_id"`
	LicenseKey             string    `db:"license_key"`
	Tier                   string    `db:"tier"`
	ExpiryDate             time.Time `db:"expiry_date"`
	Status                 string    `db:"status"`
	MaxDevices             int       `db:"max_devices"`
	MaxConcurrentSessions  int       `db:"max_concurrent_sessions"`
	MonthlyGenerationLimit int       `db:"monthly_generation_limit"`
	StorageLimitBytes      int64     `db:"storage_limit_bytes"`
	CurrentGenerationCount int       `db:"current_generation_count"`
	CurrentStorageUsed     int64     `db:"current_storage_used_bytes"`
	AutoRenewViaWallet     bool      `db:"auto_renew_via_wallet"`
}

type DeviceSession struct {
	ID          uuid.UUID `db:"id"`
	UserID      uuid.UUID `db:"user_id"`
	Fingerprint string    `db:"device_fingerprint"`
	Browser     string    `db:"browser"`
	OS          string    `db:"operating_system"`
	Status      string    `db:"status"`
}

// ValidateAndIncrementQuota atomically checks if an organization's License permits generating another newspaper issue today.
func (ls *LicenseService) ValidateAndIncrementQuota(ctx context.Context, orgID uuid.UUID, isOverdraftApproved bool) (*License, error) {
	tx, err := ls.DB.BeginTxx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, fmt.Errorf("license tx begin failed: %w", err)
	}
	defer tx.Rollback()

	var lic License
	query := `SELECT id, organization_id, license_key, tier, expiry_date, status, max_devices, max_concurrent_sessions,
                     monthly_generation_limit, storage_limit_bytes, current_generation_count, current_storage_used_bytes, auto_renew_via_wallet
              FROM licenses WHERE organization_id = $1 FOR UPDATE`
	if err := tx.GetContext(ctx, &lic, query, orgID); err != nil {
		return nil, fmt.Errorf("active license record lookup failed for org: %w", err)
	}

	if lic.Status != "ACTIVE" || time.Now().After(lic.ExpiryDate) {
		return nil, errors.New("ERR_LICENSE_EXPIRED: your publishing license key has expired or is administratively suspended")
	}

	// If tier is NOT enterprise/unlimited and quota is saturated
	if lic.Tier != "ENTERPRISE" && lic.CurrentGenerationCount >= lic.MonthlyGenerationLimit {
		if !isOverdraftApproved && !lic.AutoRenewViaWallet {
			return nil, errors.New("ERR_QUOTA_EXHAUSTED: monthly license publication limit reached; authorize wallet balance overdraft or upgrade license tier")
		}
	}

	// Increment quota counter safely within lock
	upd := `UPDATE licenses SET current_generation_count = current_generation_count + 1, updated_at = NOW() WHERE id = $1`
	if _, err := tx.ExecContext(ctx, upd, lic.ID); err != nil {
		return nil, fmt.Errorf("failed to increment license generation quota: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("license tx commit failed: %w", err)
	}

	lic.CurrentGenerationCount++
	return &lic, nil
}

// ValidateDeviceLimits checks device fingerprint against license hardware ceiling (Module 2)
func (ls *LicenseService) ValidateDeviceLimits(ctx context.Context, userID uuid.UUID, orgID uuid.UUID, newFingerprint string, browser string, os string) error {
	var lic License
	if err := ls.DB.GetContext(ctx, &lic, `SELECT max_devices FROM licenses WHERE organization_id = $1`, orgID); err != nil {
		return err
	}

	var activeDevices int
	cntQuery := `SELECT COUNT(1) FROM user_devices WHERE user_id = $1 AND status = 'ACTIVE'`
	ls.DB.GetContext(ctx, &activeDevices, cntQuery, userID)

	// Check if this fingerprint is already registered
	var existing int
	chk := `SELECT COUNT(1) FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2 AND status = 'ACTIVE'`
	ls.DB.GetContext(ctx, &existing, chk, userID, newFingerprint)

	if existing == 0 && activeDevices >= lic.MaxDevices {
		return fmt.Errorf("ERR_MAX_DEVICES_EXCEEDED: license tier allows maximum %d active devices per user. Revoke old sessions in Device Manager", lic.MaxDevices)
	}

	// Register or touch active device
	upsert := `INSERT INTO user_devices (user_id, device_fingerprint, browser, operating_system, status, last_login_at)
               VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())
               ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET last_login_at = NOW(), browser = EXCLUDED.browser, status = 'ACTIVE'`
	_, err := ls.DB.ExecContext(ctx, upsert, userID, newFingerprint, browser, os)
	return err
}
