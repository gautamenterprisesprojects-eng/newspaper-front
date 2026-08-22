-- Tracks which front-page layout template a publisher's edition used last,
-- so consecutive "generate all pages" runs pick a different one instead of
-- always defaulting to the same design. -1 means "none used yet" so the
-- very first generation lands on index 0.

ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS last_front_template_index INTEGER NOT NULL DEFAULT -1;
