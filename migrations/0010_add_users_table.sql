-- Create users table for tracking user information from Clerk
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Clerk user ID (sub from JWT)
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  profile_image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT -- JSON string for additional Clerk user data
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Drop the existing favorites table to recreate with proper foreign key
DROP TABLE IF EXISTS favorites;

-- Recreate favorites table with proper foreign key to users
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  zpid TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT, -- JSON string for storing additional property info
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (zpid) REFERENCES properties(zpid) ON DELETE CASCADE,
  UNIQUE(user_id, zpid)
);

-- Recreate indexes for favorites table
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_zpid ON favorites(zpid);