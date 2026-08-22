-- Stores each publisher's current password in a form the admin panel can
-- decrypt and display (AES-256-GCM, key held only by the backend process).
-- This is separate from publishers.password_hash, which remains the sole
-- source of truth for login and is never reversible.
--
-- NULL for any publisher whose password was set before this column existed
-- (their bcrypt hash cannot be reversed) -- the admin panel shows those as
-- "not available" until the password is reset.

ALTER TABLE publishers ADD COLUMN IF NOT EXISTS password_encrypted TEXT NULL;
