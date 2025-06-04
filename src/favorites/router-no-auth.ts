import type { Env } from '../shared/types/env';
import { 
  insertFavorite, 
  getFavoritesByUser, 
  deleteFavorite, 
  checkFavoriteExists 
} from './operations';
import { CreateFavoriteRequest, FavoritesResponse } from './types';
import { createOrUpdateUser } from '../users/operations';

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// TEMPORARY: Mock user for testing without auth
const MOCK_USER = {
  id: 'test-user-123',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
};

async function handleCreateFavorite(request: Request, env: Env): Promise<Response> {
  try {
    console.log('[FAVORITES-NO-AUTH] Using mock user for testing');
    
    // Ensure mock user exists in database
    await createOrUpdateUser(env.DB, MOCK_USER);

    const body = await request.json() as CreateFavoriteRequest;
    
    console.log('[FAVORITES-NO-AUTH] Received request body:', JSON.stringify(body));
    
    if (!body.zpid || !body.url) {
      return new Response(JSON.stringify({ error: 'Missing required fields: zpid and url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Log the zpid we're trying to save
    console.log(`[FAVORITES-NO-AUTH] Attempting to save zpid: ${body.zpid}`);
    
    // Check if already favorited
    const exists = await checkFavoriteExists(env.DB, MOCK_USER.id, body.zpid);
    if (exists) {
      return new Response(JSON.stringify({ error: 'Property already favorited' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create the favorite (no FK constraint anymore, so any zpid is allowed)
    const favoriteId = await insertFavorite(
      env.DB,
      MOCK_USER.id,
      body.zpid,
      body.url,
      body.metadata
    );
    
    console.log(`[FAVORITES-NO-AUTH] Successfully created favorite with ID: ${favoriteId}`);
    
    return new Response(JSON.stringify({
      success: true,
      id: favoriteId, // Chrome extension expects 'id' not 'favoriteId'
      favoriteId, // Keep for backwards compatibility
      message: 'Property favorited successfully (NO AUTH MODE)'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating favorite:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Failed to create favorite',
      details: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleGetFavorites(request: Request, env: Env): Promise<Response> {
  try {
    console.log('[FAVORITES-NO-AUTH] Using mock user for testing');

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return new Response(JSON.stringify({ error: 'Invalid pagination parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { favorites, total } = await getFavoritesByUser(
      env.DB,
      MOCK_USER.id,
      page,
      pageSize
    );
    
    const response: FavoritesResponse = {
      favorites,
      total,
      page,
      pageSize,
    };
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch favorites',
      details: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleDeleteFavorite(request: Request, env: Env, favoriteId: string): Promise<Response> {
  try {
    console.log('[FAVORITES-NO-AUTH] Using mock user for testing');
    
    const deleted = await deleteFavorite(env.DB, MOCK_USER.id, favoriteId);
    
    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Favorite not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Favorite removed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting favorite:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete favorite' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

export const favoritesRouterNoAuth = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/favorites', '');
    const method = request.method;
    
    console.log(`[FAVORITES-NO-AUTH] ${method} ${url.pathname}${url.search}`);
    console.log('[FAVORITES-NO-AUTH] ⚠️  WARNING: Authentication disabled for testing!');

    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handlers
    if (path === '' || path === '/') {
      if (method === 'POST') {
        return handleCreateFavorite(request, env);
      } else if (method === 'GET') {
        return handleGetFavorites(request, env);
      }
    }

    // Handle /:id routes
    const idMatch = path.match(/^\/([^\/]+)$/);
    if (idMatch) {
      const favoriteId = idMatch[1];
      if (method === 'DELETE') {
        return handleDeleteFavorite(request, env, favoriteId);
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};