-- Create collections table
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    location TEXT NOT NULL,
    listing_category TEXT,
    home_type TEXT,
    days_on_zillow TEXT,
    exact_address BOOLEAN DEFAULT FALSE,
    snapshot_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    record_count INTEGER DEFAULT 0,
    r2_file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Create properties table (basic property info)
CREATE TABLE IF NOT EXISTS properties (
    zpid TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    url TEXT,
    street_address TEXT,
    city TEXT,
    state TEXT,
    zipcode TEXT,
    price INTEGER,
    currency TEXT DEFAULT 'USD',
    bedrooms INTEGER,
    bathrooms REAL,
    living_area INTEGER,
    lot_size INTEGER,
    year_built INTEGER,
    home_type TEXT,
    home_status TEXT,
    latitude REAL,
    longitude REAL,
    zestimate INTEGER,
    rent_zestimate INTEGER,
    has_details BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id)
);

-- Create property_details table (detailed property info from full scrape)
CREATE TABLE IF NOT EXISTS property_details (
    zpid TEXT PRIMARY KEY,
    description TEXT,
    property_tax_rate REAL,
    monthly_hoa_fee INTEGER,
    parcel_id TEXT,
    county_fips TEXT,
    county TEXT,
    has_garage BOOLEAN DEFAULT FALSE,
    has_cooling BOOLEAN DEFAULT FALSE,
    has_heating BOOLEAN DEFAULT FALSE,
    heating_systems TEXT, -- JSON array
    appliances TEXT, -- JSON array
    flooring TEXT,
    architectural_style TEXT,
    basement TEXT,
    fencing TEXT,
    water_source TEXT, -- JSON array
    parking_capacity INTEGER,
    roof_type TEXT,
    structure_type TEXT,
    zoning TEXT,
    lot_features TEXT, -- JSON array
    exterior_features TEXT, -- JSON array
    fireplace_features TEXT,
    laundry_features TEXT, -- JSON array
    other_structures TEXT,
    elementary_school TEXT,
    middle_school TEXT,
    high_school TEXT,
    photo_count INTEGER DEFAULT 0,
    date_sold DATE,
    last_sold_price INTEGER,
    days_on_zillow INTEGER,
    page_view_count INTEGER,
    favorite_count INTEGER,
    tour_view_count INTEGER,
    raw_data TEXT, -- Complete JSON of the property
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zpid) REFERENCES properties(zpid)
);

-- Create property_photos table (responsive photos data)
CREATE TABLE IF NOT EXISTS property_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    photo_order INTEGER NOT NULL,
    url_192 TEXT,
    url_384 TEXT,
    url_576 TEXT,
    url_768 TEXT,
    url_960 TEXT,
    url_1152 TEXT,
    url_1344 TEXT,
    url_1536 TEXT,
    webp_192 TEXT,
    webp_384 TEXT,
    webp_576 TEXT,
    webp_768 TEXT,
    webp_960 TEXT,
    webp_1152 TEXT,
    webp_1344 TEXT,
    webp_1536 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zpid) REFERENCES properties(zpid)
);

-- Create price_history table
CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    date DATE,
    event TEXT,
    price INTEGER,
    price_change_rate REAL,
    price_per_square_foot REAL,
    source TEXT,
    posting_is_rental BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zpid) REFERENCES properties(zpid)
);

-- Create tax_history table
CREATE TABLE IF NOT EXISTS tax_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    year INTEGER,
    tax_paid INTEGER,
    tax_increase_rate REAL,
    assessed_value INTEGER,
    value_increase_rate REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zpid) REFERENCES properties(zpid)
);

-- Create schools table
CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zpid TEXT NOT NULL,
    name TEXT NOT NULL,
    grades TEXT,
    rating REAL,
    distance REAL,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zpid) REFERENCES properties(zpid)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_collection_id ON properties(collection_id);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(city, state, zipcode);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_bedrooms ON properties(bedrooms);
CREATE INDEX IF NOT EXISTS idx_properties_home_type ON properties(home_type);
CREATE INDEX IF NOT EXISTS idx_property_photos_zpid ON property_photos(zpid);
CREATE INDEX IF NOT EXISTS idx_price_history_zpid ON price_history(zpid);
CREATE INDEX IF NOT EXISTS idx_tax_history_zpid ON tax_history(zpid);
CREATE INDEX IF NOT EXISTS idx_schools_zpid ON schools(zpid);
CREATE INDEX IF NOT EXISTS idx_collections_location ON collections(location);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status);
