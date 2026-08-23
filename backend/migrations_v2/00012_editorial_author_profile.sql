-- Publisher-level editorial author defaults.
--
-- These are used by the newspaper generator for editorial-page author rails
-- when a live editorial article does not provide its own writer portrait/name.
ALTER TABLE publisher_profiles
  ADD COLUMN IF NOT EXISTS editorial_author_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS editorial_author_image_url TEXT NOT NULL DEFAULT '';
