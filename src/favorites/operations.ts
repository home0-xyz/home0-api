import { D1Database } from '@cloudflare/workers-types';
import { Favorite, FavoriteMetadata } from './types';

export async function insertFavorite(
  db: D1Database,
  userId: string,
  zpid: string,
  url: string,
  metadata?: FavoriteMetadata
): Promise<string> {
  const id = crypto.randomUUID();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  
  await db.prepare(`
    INSERT INTO favorites (id, user_id, zpid, url, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, userId, zpid, url, metadataJson).run();
  
  return id;
}

export async function getFavoritesByUser(
  db: D1Database,
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ favorites: Favorite[], total: number }> {
  const offset = (page - 1) * pageSize;
  
  // Get total count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM favorites WHERE user_id = ?
  `).bind(userId).first<{ total: number }>();
  
  const total = countResult?.total || 0;
  
  // Get paginated results
  const results = await db.prepare(`
    SELECT f.*, 
           p.street_address, p.city, p.state, p.zipcode,
           p.price, p.bedrooms, p.bathrooms, p.living_area
    FROM favorites f
    LEFT JOIN properties p ON f.zpid = p.zpid
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(userId, pageSize, offset).all();
  
  const favorites: Favorite[] = results.results.map((row: any) => {
    // Parse stored metadata if exists
    let metadata = row.metadata ? JSON.parse(row.metadata) : {};
    
    // Enrich with property data if available
    if (row.street_address || row.price) {
      // Build full address
      const addressParts = [
        row.street_address,
        row.city,
        row.state,
        row.zipcode
      ].filter(Boolean);
      
      metadata = {
        ...metadata,
        address: addressParts.join(', ') || metadata.address,
        price: row.price || metadata.price,
        beds: row.bedrooms || metadata.beds,
        baths: row.bathrooms || metadata.baths,
        sqft: row.living_area || metadata.sqft,
      };
    }
    
    return {
      id: row.id,
      user_id: row.user_id,
      zpid: row.zpid,
      url: row.url,
      created_at: row.created_at,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  });
  
  return { favorites, total };
}

export async function deleteFavorite(
  db: D1Database,
  userId: string,
  favoriteId: string
): Promise<boolean> {
  const result = await db.prepare(`
    DELETE FROM favorites WHERE id = ? AND user_id = ?
  `).bind(favoriteId, userId).run();
  
  return result.meta.rows_written > 0;
}

export async function checkFavoriteExists(
  db: D1Database,
  userId: string,
  zpid: string
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM favorites WHERE user_id = ? AND zpid = ?
  `).bind(userId, zpid).first();
  
  return result !== null;
}