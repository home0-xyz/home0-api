import { D1Database } from '@cloudflare/workers-types';
import { User, CreateUserRequest } from './types';

export async function createOrUpdateUser(
  db: D1Database,
  userData: CreateUserRequest
): Promise<void> {
  const metadataJson = userData.metadata ? JSON.stringify(userData.metadata) : null;
  
  // Use INSERT OR REPLACE to handle both create and update
  await db.prepare(`
    INSERT OR REPLACE INTO users (
      id, email, first_name, last_name, profile_image_url, 
      updated_at, last_login_at, metadata
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
  `).bind(
    userData.id,
    userData.email || null,
    userData.first_name || null,
    userData.last_name || null,
    userData.profile_image_url || null,
    metadataJson
  ).run();
}

export async function getUserById(
  db: D1Database,
  userId: string
): Promise<User | null> {
  const result = await db.prepare(`
    SELECT * FROM users WHERE id = ?
  `).bind(userId).first<User>();
  
  if (result && result.metadata) {
    result.metadata = JSON.parse(result.metadata as any);
  }
  
  return result;
}

export async function updateLastLogin(
  db: D1Database,
  userId: string
): Promise<void> {
  await db.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(userId).run();
}

export async function userExists(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM users WHERE id = ?
  `).bind(userId).first();
  
  return result !== null;
}