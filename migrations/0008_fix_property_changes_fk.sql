-- Fix foreign key constraint issue in property_changes table
-- Drop the existing table and recreate without FK constraint

DROP TABLE IF EXISTS property_changes;

-- Recreate without foreign key constraint
CREATE TABLE property_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK(change_type IN ('new_listing', 'price_change', 'status_change', 'removed')),
    change_date DATE NOT NULL,
    old_value TEXT,
    new_value TEXT,
    change_details TEXT, -- JSON with additional details
    collection_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recreate indexes
CREATE INDEX idx_property_changes_zpid ON property_changes(zpid);
CREATE INDEX idx_property_changes_date ON property_changes(change_date);
CREATE INDEX idx_property_changes_type ON property_changes(change_type);