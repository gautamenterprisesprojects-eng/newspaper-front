-- Volume-number auto-increment: the publisher enters their volume number once
-- (tied to whatever date it was actually correct for), and every subsequent
-- "generate all pages" run advances it by however many calendar days (Daily)
-- or weeks (Weekly, publisher_profiles.publication_type) have actually
-- elapsed since last_published_date — not just +1 per click — so a skipped
-- day/week is still reflected in the next edition's volume number instead of
-- silently disappearing. NULL last_volume_number means the publisher hasn't
-- set a starting value yet; the execute handler leaves the profile's
-- volume/date untouched in that case rather than inventing a baseline.
ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS last_volume_number INTEGER;
ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS last_published_date DATE;

-- Replaces manual_articles (kept, unused, for now) with per-box content:
-- headline/subheadline/place/body/image/caption at a specific slot_index on
-- a specific page, matching the generator's own manualTargetSlotIndex
-- pinning so a box picked in the portal's page-picker lands in that exact
-- box rather than wherever the wire-content ranking would have put it.
-- editor_portrait_url/editor_name are only meaningful on an Editorial page's
-- two author-rail slots — blank for every ordinary news box.
CREATE TABLE IF NOT EXISTS manual_box_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    slot_index INTEGER NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    subheadline TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    image_caption TEXT NOT NULL DEFAULT '',
    editor_portrait_url TEXT NOT NULL DEFAULT '',
    editor_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_manual_box_content_publisher_page ON manual_box_content(publisher_id, page_number);
