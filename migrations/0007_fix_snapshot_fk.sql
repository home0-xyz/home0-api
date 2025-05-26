-- Fix foreign key constraint issue in property_snapshots table
-- Drop the existing table and recreate without FK constraint

DROP TABLE IF EXISTS property_snapshots;

-- Recreate without foreign key constraint
CREATE TABLE property_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    price REAL,
    home_status TEXT,
    days_on_market INTEGER,
    is_new_listing BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recreate indexes
CREATE INDEX idx_property_snapshots_zpid ON property_snapshots(zpid);
CREATE INDEX idx_property_snapshots_date ON property_snapshots(snapshot_date);