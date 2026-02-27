-- This table will store our Miller Column tabs
CREATE TABLE IF NOT EXISTS tabs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    parent_id TEXT REFERENCES tabs(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL
);

-- Index for faster lookups when traversing hierarchy
CREATE INDEX IF NOT EXISTS idx_parent_id ON tabs(parent_id);