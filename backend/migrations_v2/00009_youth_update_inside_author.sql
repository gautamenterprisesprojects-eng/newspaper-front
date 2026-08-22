-- Youth UPDATE inside-page author badges.
CREATE TABLE IF NOT EXISTS youth_update_inside_author (
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    editor_name VARCHAR(160) NOT NULL DEFAULT '',
    designation VARCHAR(160) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (publisher_id, slot_index),
    CHECK (slot_index BETWEEN 1 AND 3)
);
