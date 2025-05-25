-- Add workflow_id column to collections table for webhook mapping
ALTER TABLE collections ADD COLUMN workflow_id TEXT;

-- Create index for faster lookup by snapshot_id
CREATE INDEX IF NOT EXISTS idx_collections_snapshot_id ON collections(snapshot_id);

-- Create index for workflow_id lookup
CREATE INDEX IF NOT EXISTS idx_collections_workflow_id ON collections(workflow_id);