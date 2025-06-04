-- Remove foreign key constraint on favorites.zpid to allow favoriting properties not yet in database

-- Drop the existing favorites table
DROP TABLE IF EXISTS favorites;

-- Recreate favorites table WITHOUT the zpid foreign key constraint
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  zpid TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT, -- JSON string for storing additional property info
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- REMOVED: FOREIGN KEY (zpid) REFERENCES properties(zpid) ON DELETE CASCADE
  UNIQUE(user_id, zpid)
);

-- Recreate indexes for favorites table
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_zpid ON favorites(zpid);