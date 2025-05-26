-- Create comprehensive workflow tracking table
CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_type TEXT NOT NULL CHECK(workflow_type IN ('data_collector', 'property_details')),
    status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    
    -- Input parameters (stored as JSON for flexibility)
    input_params TEXT NOT NULL, -- JSON string of workflow parameters
    
    -- Timing information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER, -- calculated duration
    
    -- Results and metrics
    total_requested INTEGER DEFAULT 0, -- total items requested to process
    total_processed INTEGER DEFAULT 0, -- items successfully processed
    total_errors INTEGER DEFAULT 0,    -- items that failed
    total_skipped INTEGER DEFAULT 0,   -- items skipped (already existed, etc.)
    
    -- Output information
    output_summary TEXT, -- JSON string of key output metrics
    error_message TEXT,  -- error details if failed
    
    -- Resource usage
    r2_files_created INTEGER DEFAULT 0,
    r2_total_size_bytes INTEGER DEFAULT 0,
    
    -- BrightData specific tracking
    brightdata_snapshots TEXT, -- JSON array of snapshot IDs used
    webhook_used BOOLEAN DEFAULT FALSE,
    
    -- Relationship tracking
    triggered_by TEXT, -- user ID, system, or parent workflow ID
    collection_id TEXT, -- links to collections table for data_collector workflows
    
    -- Metadata
    environment TEXT DEFAULT 'production',
    worker_version TEXT, -- for tracking code versions
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflow_runs_type ON workflow_runs(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_type_status ON workflow_runs(workflow_type, status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_collection_id ON workflow_runs(collection_id);

-- View for easy querying of active workflows
CREATE VIEW IF NOT EXISTS active_workflows AS
SELECT 
    id,
    workflow_type,
    status,
    created_at,
    started_at,
    CASE 
        WHEN status = 'running' AND started_at IS NOT NULL 
        THEN (julianday('now') - julianday(started_at)) * 86400
        ELSE duration_seconds 
    END as current_duration_seconds,
    total_requested,
    total_processed,
    total_errors
FROM workflow_runs 
WHERE status IN ('queued', 'running')
ORDER BY created_at DESC;

-- View for recent workflow summary
CREATE VIEW IF NOT EXISTS recent_workflow_summary AS
SELECT 
    workflow_type,
    status,
    COUNT(*) as count,
    AVG(duration_seconds) as avg_duration_seconds,
    SUM(total_processed) as total_items_processed,
    SUM(total_errors) as total_errors,
    MAX(created_at) as last_run
FROM workflow_runs 
WHERE created_at > datetime('now', '-7 days')
GROUP BY workflow_type, status
ORDER BY workflow_type, status;