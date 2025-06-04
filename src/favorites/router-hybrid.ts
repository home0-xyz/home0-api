import type { Env } from '../shared/types/env';
import { verifyClerkAuth, getClerkUserInfo } from '../shared/clerk-auth';
import { 
  insertFavorite, 
  getFavoritesByUser, 
  deleteFavorite, 
  checkFavoriteExists 
} from './operations';
import { CreateFavoriteRequest, FavoritesResponse } from './types';
import { createOrUpdateUser, updateLastLogin } from '../users/operations';

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Test-User',
  'Access-Control-Max-Age': '86400',
};

// Test user for development
const TEST_USER = {
  id: 'test-user-123',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
};

async function getAuthInfo(request: Request, env: Env): Promise<{ userId: string, isTestUser: boolean } | null> {
  // First check for test user header
  const testUserHeader = request.headers.get('X-Test-User');
  if (testUserHeader === 'test-user-123') {
    console.log('[AUTH-HYBRID] Using test user mode');
    // Ensure test user exists
    await createOrUpdateUser(env.DB, TEST_USER);
    return { userId: TEST_USER.id, isTestUser: true };
  }

  // Otherwise try Clerk auth
  const userInfo = await getClerkUserInfo(request, env);
  if (userInfo) {
    // Create/update real user
    await createOrUpdateUser(env.DB, {
      id: userInfo.sub,
      email: userInfo.email,
      first_name: userInfo.first_name,
      last_name: userInfo.last_name,
      profile_image_url: userInfo.profile_image_url,
    });
    return { userId: userInfo.sub, isTestUser: false };
  }

  return null;
}

async function handleCreateFavorite(request: Request, env: Env): Promise<Response> {
  try {
    const authInfo = await getAuthInfo(request, env);
    if (!authInfo) {
      console.log('[FAVORITES-HYBRID] Unauthorized - no valid auth');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json() as CreateFavoriteRequest;
    
    if (!body.zpid || !body.url) {
      return new Response(JSON.stringify({ error: 'Missing required fields: zpid and url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if already favorited
    const exists = await checkFavoriteExists(env.DB, authInfo.userId, body.zpid);
    if (exists) {
      return new Response(JSON.stringify({ error: 'Property already favorited' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create the favorite
    const favoriteId = await insertFavorite(
      env.DB,
      authInfo.userId,
      body.zpid,
      body.url,
      body.metadata
    );
    
    const message = authInfo.isTestUser 
      ? 'Property favorited successfully (TEST MODE)'
      : 'Property favorited successfully';
    
    return new Response(JSON.stringify({
      success: true,
      id: favoriteId,
      favoriteId,
      message
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
    const authInfo = await getAuthInfo(request, env);
    if (!authInfo) {
      console.log('[FAVORITES-HYBRID] Unauthorized - no valid auth');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Update last login time for real users
    if (!authInfo.isTestUser) {
      await updateLastLogin(env.DB, authInfo.userId);
    }

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
      authInfo.userId,
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
    const authInfo = await getAuthInfo(request, env);
    if (!authInfo) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const deleted = await deleteFavorite(env.DB, authInfo.userId, favoriteId);
    
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

export const favoritesRouterHybrid = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/favorites', '');
    const method = request.method;
    
    console.log(`[FAVORITES-HYBRID] ${method} ${url.pathname}${url.search}`);

    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      console.log('[FAVORITES-HYBRID] CORS preflight request');
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