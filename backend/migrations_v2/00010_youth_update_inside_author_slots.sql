-- Compatibility upgrade for databases that already created the first
-- single-author version of youth_update_inside_author.
ALTER TABLE youth_update_inside_author ADD COLUMN IF NOT EXISTS slot_index INTEGER NOT NULL DEFAULT 1;

DO $$
DECLARE
    pk_name TEXT;
    pk_cols TEXT;
BEGIN
    SELECT c.conname, string_agg(a.attname, ',' ORDER BY a.attnum)
      INTO pk_name, pk_cols
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
     WHERE t.relname = 'youth_update_inside_author'
       AND c.contype = 'p'
     GROUP BY c.conname;

    IF pk_name IS NOT NULL AND pk_cols <> 'publisher_id,slot_index' THEN
        EXECUTE format('ALTER TABLE youth_update_inside_author DROP CONSTRAINT %I', pk_name);
    END IF;
END $$;

DO $$
BEGIN
    ALTER TABLE youth_update_inside_author
      ADD CONSTRAINT youth_update_inside_author_pkey PRIMARY KEY (publisher_id, slot_index);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE youth_update_inside_author
      ADD CONSTRAINT youth_update_inside_author_slot_check CHECK (slot_index BETWEEN 1 AND 3);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
