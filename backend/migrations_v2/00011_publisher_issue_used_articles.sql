-- Tracks live/preloaded stories already placed in a publisher's current issue.
-- Single-page generation opens each page in a fresh generator session, so this
-- issue-level memory prevents Page 1 stories from repeating later on Sports,
-- National, Madhya Pradesh, Classified/आस-पास, etc.

CREATE TABLE IF NOT EXISTS publisher_issue_used_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    issue_number_ank VARCHAR(100) NOT NULL,
    publication_date DATE NOT NULL,
    page_number INTEGER NOT NULL,
    page_label VARCHAR(120) NOT NULL DEFAULT '',
    category VARCHAR(80) NOT NULL DEFAULT '',
    article_id TEXT NOT NULL DEFAULT '',
    headline TEXT NOT NULL DEFAULT '',
    normalized_headline TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    normalized_source_url TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'USED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_used_articles_issue
    ON publisher_issue_used_articles (publisher_id, issue_number_ank, publication_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_used_article_id
    ON publisher_issue_used_articles (publisher_id, issue_number_ank, publication_date, article_id)
    WHERE article_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_used_headline
    ON publisher_issue_used_articles (publisher_id, issue_number_ank, publication_date, normalized_headline)
    WHERE normalized_headline <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_used_source
    ON publisher_issue_used_articles (publisher_id, issue_number_ank, publication_date, normalized_source_url)
    WHERE normalized_source_url <> '';
