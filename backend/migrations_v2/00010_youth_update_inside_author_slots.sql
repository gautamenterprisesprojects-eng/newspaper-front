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

-- On a brand-new database, the table above (00009) already creates the
-- composite PK directly -- there is no legacy single-column PK for the
-- detection block above to drop, so this ADD would be redundant. Attempting
-- it anyway raises "multiple primary keys ... are not allowed", which is a
-- different error than duplicate_object and was going uncaught, crashing
-- the whole initdb run. Skip outright when the table already has the target
-- composite PK.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'youth_update_inside_author'
           AND c.contype = 'p'
    ) THEN
        ALTER TABLE youth_update_inside_author
          ADD CONSTRAINT youth_update_inside_author_pkey PRIMARY KEY (publisher_id, slot_index);
    END IF;
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
