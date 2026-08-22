package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type WalletService struct {
	DB *sqlx.DB
}

type LedgerTransactionType string

const (
	TxnCredit       LedgerTransactionType = "CREDIT"
	TxnDebit        LedgerTransactionType = "DEBIT"
	TxnRefund       LedgerTransactionType = "REFUND"
	TxnRecharge     LedgerTransactionType = "RECHARGE"
	TxnSubscription LedgerTransactionType = "SUBSCRIPTION_FEE"
	TxnManualAdjust LedgerTransactionType = "MANUAL_ADJUST"
)

type Wallet struct {
	ID             uuid.UUID `db:"id"`
	OrganizationID uuid.UUID `db:"organization_id"`
	CurrentBalance float64   `db:"current_balance"`
	IsFrozen       bool      `db:"is_frozen"`
}

// ReserveGenerationCost executes Phase 1 of our Two-Phase Wallet ledger architecture.
// It applies a serializable row lock on the publisher's wallet and creates a PENDING_DEBIT ledger record.
func (ws *WalletService) ReserveGenerationCost(ctx context.Context, orgID uuid.UUID, amount float64, jobRef string, desc string) error {
	tx, err := ws.DB.BeginTxx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return fmt.Errorf("failed to initiate serializable wallet transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Lock Wallet Row Exclusively
	var w Wallet
	lockQuery := `SELECT id, organization_id, current_balance, is_frozen 
                  FROM wallets WHERE organization_id = $1 FOR UPDATE`
	if err := tx.GetContext(ctx, &w, lockQuery, orgID); err != nil {
		return fmt.Errorf("could not acquire lock on organization wallet: %w", err)
	}

	// 2. Validate Defensive Rules
	if w.IsFrozen {
		return errors.New("wallet is currently FROZEN by administrative compliance order; newspaper generation suspended")
	}
	if w.CurrentBalance < amount {
		return fmt.Errorf("insufficient usable wallet balance: current ₹%.2f, required ₹%.2f", w.CurrentBalance, amount)
	}

	newBalance := w.CurrentBalance - amount

	// 3. Insert Immutable Ledger Debit Event
	ledgerQuery := `INSERT INTO wallet_ledgers (wallet_id, transaction_type, amount, balance_after, reference_id, description, status)
                    VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_DEBIT')`
	if _, err := tx.ExecContext(ctx, ledgerQuery, w.ID, TxnDebit, -amount, newBalance, jobRef, desc); err != nil {
		return fmt.Errorf("failed to write immutable wallet debit ledger row: %w", err)
	}

	// 4. Update Cached Balance
	updQuery := `UPDATE wallets SET current_balance = $1, updated_at = NOW() WHERE id = $2`
	if _, err := tx.ExecContext(ctx, updQuery, newBalance, w.ID); err != nil {
		return fmt.Errorf("failed to update aggregate wallet balance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("transaction commit failed during wallet deduction: %w", err)
	}

	return nil
}

// RollbackFailedGeneration executes an automated refund if the external Newspaper Generator Engine timeouts or fails.
func (ws *WalletService) RollbackFailedGeneration(ctx context.Context, orgID uuid.UUID, refundAmount float64, jobRef string) error {
	tx, err := ws.DB.BeginTxx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return fmt.Errorf("rollback tx initiation failed: %w", err)
	}
	defer tx.Rollback()

	var w Wallet
	if err := tx.GetContext(ctx, &w, `SELECT id, current_balance FROM wallets WHERE organization_id = $1 FOR UPDATE`, orgID); err != nil {
		return err
	}

	newBalance := w.CurrentBalance + refundAmount

	// Mark original debit ledger as rolled back
	tx.ExecContext(ctx, `UPDATE wallet_ledgers SET status = 'REFUNDED_FAIL' WHERE reference_id = $1`, jobRef)

	// Add clear Refund credit line to ledger
	refundQuery := `INSERT INTO wallet_ledgers (wallet_id, transaction_type, amount, balance_after, reference_id, description, status)
                    VALUES ($1, $2, $3, $4, $5, 'Automated Refund: External Newspaper Generator Engine Failure', 'COMMITTED_CREDIT')`
	tx.ExecContext(ctx, refundQuery, w.ID, TxnRefund, refundAmount, newBalance, jobRef)

	tx.ExecContext(ctx, `UPDATE wallets SET current_balance = $1, updated_at = NOW() WHERE id = $2`, newBalance, w.ID)

	return tx.Commit()
}
