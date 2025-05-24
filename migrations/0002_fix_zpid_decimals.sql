-- Fix ZPID decimal suffixes in all tables
-- This migration removes .0 suffixes from ZPIDs that were incorrectly stored

-- Update properties table
UPDATE properties
SET zpid = REPLACE(zpid, '.0', '')
WHERE zpid LIKE '%.0';

-- Update property_details table
UPDATE property_details
SET zpid = REPLACE(zpid, '.0', '')
WHERE zpid LIKE '%.0';

-- Update property_photos table
UPDATE property_photos
SET zpid = REPLACE(zpid, '.0', '')
WHERE zpid LIKE '%.0';

-- Update price_history table
UPDATE price_history
SET zpid = REPLACE(zpid, '.0', '')
WHERE zpid LIKE '%.0';

-- Update tax_history table
UPDATE tax_history
SET zpid = REPLACE(zpid, '.0', '')
WHERE zpid LIKE '%.0';

-- Update schools table
UPDATE schools
SET zpid = REPLACE(zpid, '.0', '')
WHERE zpid LIKE '%.0';
