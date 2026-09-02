-- Device binding: an account can only be used from browsers that were
-- explicitly enrolled, and only through a one-time link an admin issued.
-- Publishers get one browser each; the shared admin account gets four (two
-- people, a laptop and a phone apiece). An admin-trusted browser may sign
-- into any publisher account WITHOUT consuming that publisher's own slot --
-- otherwise the first support login would lock the real publisher out.
--
-- Nothing here is destructive: two new tables and two additive columns, so
-- a rollback is dropping them. Every statement is IF NOT EXISTS because
-- runMigrations replays every file on each boot.

-- The browsers allowed to use an account. One row per enrolled browser.
-- device_hash stores a SHA-256 of the cookie value, never the value itself,
-- so a database leak does not hand anyone a working device credential.
CREATE TABLE IF NOT EXISTS account_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    device_hash TEXT NOT NULL UNIQUE,
    -- 'admin' browsers may sign into any account; 'publisher' browsers only
    -- into the one they are bound to.
    trust_level VARCHAR(20) NOT NULL DEFAULT 'publisher' CHECK (trust_level IN ('admin', 'publisher')),
    user_agent TEXT NOT NULL DEFAULT '',
    first_ip VARCHAR(64) NOT NULL DEFAULT '',
    last_ip VARCHAR(64) NOT NULL DEFAULT '',
    first_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Set instead of deleting, so an unbind keeps its audit trail and the
    -- same cookie can never be silently re-accepted later.
    revoked_at TIMESTAMPTZ NULL,
    revoked_by VARCHAR(120) NOT NULL DEFAULT ''
);

-- Slot counting and the nginx auth_request lookup are the only two hot
-- paths, and both filter on "live devices" -- hence the partial index.
CREATE INDEX IF NOT EXISTS idx_account_devices_live
    ON account_devices (publisher_id) WHERE revoked_at IS NULL;

-- One-time enrolment links. The token itself is never stored, only its
-- hash: the copy in the admin's WhatsApp message is the only copy that
-- exists. A row is spent (used_at set) the moment a browser binds with it.
CREATE TABLE IF NOT EXISTS enrolment_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    used_device_id UUID NULL REFERENCES account_devices(id) ON DELETE SET NULL,
    -- Re-issuing a link for an account cancels the previous one, so there
    -- is never more than one live link per account to lose track of.
    cancelled_at TIMESTAMPTZ NULL,
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enrolment_tokens_live
    ON enrolment_tokens (publisher_id) WHERE used_at IS NULL AND cancelled_at IS NULL;

-- Which browser a login came from, and whether it was an admin browser
-- acting on a publisher account. Without the second flag an admin testing
-- cliffdemo1 is indistinguishable from cliffdemo1's own session -- and
-- generating debits that publisher's wallet, so the difference matters.
ALTER TABLE login_logs
    ADD COLUMN IF NOT EXISTS device_id UUID NULL,
    ADD COLUMN IF NOT EXISTS via_admin_device BOOLEAN NOT NULL DEFAULT FALSE;

-- Refusals are recorded in the same table as successes, so one query
-- answers "is a publisher stuck, or is someone probing us?".
-- (status values used by the handler: DEVICE_BLOCKED, DEVICE_SLOTS_FULL,
--  ENROLMENT_TOKEN_INVALID.)
