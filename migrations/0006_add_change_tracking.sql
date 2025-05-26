-- Migration: Add change tracking for property monitoring
-- This tracks changes in property listings over time

-- Table to track property history snapshots
CREATE TABLE IF NOT EXISTS property_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    price REAL,
    home_status TEXT,
    days_on_market INTEGER,
    is_new_listing BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id)
);

-- Table to track specific changes
CREATE TABLE IF NOT EXISTS property_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK(change_type IN ('new_listing', 'price_change', 'status_change', 'removed')),
    change_date DATE NOT NULL,
    old_value TEXT,
    new_value TEXT,
    change_details TEXT, -- JSON with additional details
    collection_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id)
);

-- Table for daily monitoring runs
CREATE TABLE IF NOT EXISTS monitoring_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date DATE NOT NULL,
    zip_codes TEXT NOT NULL, -- JSON array of monitored zips
    total_properties INTEGER DEFAULT 0,
    new_listings INTEGER DEFAULT 0,
    price_changes INTEGER DEFAULT 0,
    status_changes INTEGER DEFAULT 0,
    removed_listings INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_property_snapshots_zpid ON property_snapshots(zpid);
CREATE INDEX IF NOT EXISTS idx_property_snapshots_date ON property_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_property_changes_zpid ON property_changes(zpid);
CREATE INDEX IF NOT EXISTS idx_property_changes_date ON property_changes(change_date);
CREATE INDEX IF NOT EXISTS idx_property_changes_type ON property_changes(change_type);

-- View for latest property status
CREATE VIEW IF NOT EXISTS latest_property_status AS
SELECT DISTINCT
    p.zpid,
    p.street_address,
    p.city,
    p.zipcode,
    p.price as current_price,
    p.home_status as current_status,
    ps.price as previous_price,
    ps.home_status as previous_status,
    CASE 
        WHEN ps.zpid IS NULL THEN 'new'
        WHEN p.price != ps.price THEN 'price_changed'
        WHEN p.home_status != ps.home_status THEN 'status_changed'
        ELSE 'unchanged'
    END as change_status
FROM properties p
LEFT JOIN (
    SELECT zpid, price, home_status
    FROM property_snapshots
    WHERE snapshot_date = date('now', '-1 day')
) ps ON p.zpid = ps.zpid;

-- View for daily change summary
CREATE VIEW IF NOT EXISTS daily_change_summary AS
SELECT 
    change_date,
    change_type,
    COUNT(*) as change_count,
    COUNT(DISTINCT zpid) as unique_properties
FROM property_changes
WHERE change_date >= date('now', '-30 days')
GROUP BY change_date, change_type
ORDER BY change_date DESC, change_type;