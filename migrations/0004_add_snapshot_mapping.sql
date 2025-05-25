-- Create table for mapping BrightData snapshots to workflow instances
CREATE TABLE IF NOT EXISTS snapshot_workflow_mapping (
    snapshot_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    workflow_type TEXT NOT NULL CHECK(workflow_type IN ('data_collector', 'property_details')),
    webhook_secret TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups by workflow_id
CREATE INDEX IF NOT EXISTS idx_snapshot_workflow_id ON snapshot_workflow_mapping(workflow_id);

-- Add webhook-related columns to property_details table
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- These will fail silently if columns already exist
ALTER TABLE property_details ADD COLUMN webhook_delivered BOOLEAN DEFAULT FALSE;
ALTER TABLE property_details ADD COLUMN webhook_delivered_at TIMESTAMP;