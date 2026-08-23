-- Publisher-level editorial author list for choosing the author while making
-- an editorial page. The older single author columns remain as a default and
-- compatibility path.
ALTER TABLE publisher_profiles
  ADD COLUMN IF NOT EXISTS editorial_authors JSONB NOT NULL DEFAULT '[]'::jsonb;
