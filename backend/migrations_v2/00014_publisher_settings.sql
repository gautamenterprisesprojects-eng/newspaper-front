-- Publisher-controlled, one-time settings: multi-edition headers, a brand
-- theme color, and the page plan (now with multi-category pages). Settings
-- are locked server-side after the first save; only an admin can unlock them
-- (see settings_locked and SaaSAdminUnlockSettings).
ALTER TABLE publisher_profiles
  ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS editions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS settings_locked BOOLEAN NOT NULL DEFAULT FALSE;
