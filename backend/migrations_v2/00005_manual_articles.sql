-- Manual articles a publisher supplies for the current issue (headline, body,
-- an optional image), merged into the automated newswire pool at generation
-- time so a few guaranteed slots on any page can carry the publisher's own
-- reporting instead of wire content. Fresh per issue: the backend replaces
-- the full set for a publisher on every submission (delete then insert)
-- rather than accumulating history, so this table never carries stale
-- content forward from a previous edition.

CREATE TABLE IF NOT EXISTS manual_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    headline TEXT NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_manual_articles_publisher ON manual_articles(publisher_id, page_number);
