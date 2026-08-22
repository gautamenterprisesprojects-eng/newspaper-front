-- Youth UPDATE's own front-page masthead carries four teaser slots (cutout
-- photo + headline + category label) that the publisher edits fresh before
-- each "generate" run -- same delete+reinsert-per-save semantics as
-- manual_box_content (see 00007), just scoped to the masthead itself
-- rather than a page's story boxes, so there is no page_number here.
--
-- Built for exactly one publisher today (85a50d12-8aa3-4f88-93aa-8153443c1c98,
-- "Youth UPDATE") but not hardcoded to it at the schema level -- any
-- publisher_id can hold rows here, the same way manual_box_content works for
-- any publisher even though only some templates place manual boxes at all.
-- The gating to this one publisher lives in application code (handlers +
-- frontend), not the table.
CREATE TABLE IF NOT EXISTS masthead_teaser_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    category_label TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_masthead_teaser_content_publisher ON masthead_teaser_content(publisher_id);
