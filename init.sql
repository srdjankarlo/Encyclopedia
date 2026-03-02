-- This table will store our Miller Column tabs
CREATE TABLE IF NOT EXISTS tabs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    -- This stores which window ID this tab "opened"
    child_window_id TEXT, 
    -- This stores the ID of the window this tab LIVES in
    parent_id TEXT, 
    created_at BIGINT NOT NULL
);

-- Index for faster lookups when traversing hierarchy
CREATE INDEX IF NOT EXISTS idx_parent_id ON tabs(parent_id);