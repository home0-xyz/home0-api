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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

async function handleCreateFavorite(request: Request, env: Env): Promise<Response> {
  try {
    const userInfo = await getClerkUserInfo(request, env);
    if (!userInfo) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = userInfo.sub;
    
    // Ensure user exists in database
    await createOrUpdateUser(env.DB, {
      id: userId,
      email: userInfo.email,
      first_name: userInfo.first_name,
      last_name: userInfo.last_name,
      profile_image_url: userInfo.profile_image_url,
    });

    const body = await request.json() as CreateFavoriteRequest;
    
    if (!body.zpid || !body.url) {
      return new Response(JSON.stringify({ error: 'Missing required fields: zpid and url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if already favorited
    const exists = await checkFavoriteExists(env.DB, userId, body.zpid);
    if (exists) {
      return new Response(JSON.stringify({ error: 'Property already favorited' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create the favorite
    const favoriteId = await insertFavorite(
      env.DB,
      userId,
      body.zpid,
      body.url,
      body.metadata
    );
    
    return new Response(JSON.stringify({
      success: true,
      id: favoriteId, // Chrome extension expects 'id'
      favoriteId, // Keep for backwards compatibility
      message: 'Property favorited successfully'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating favorite:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', errorMessage);
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
    const userInfo = await getClerkUserInfo(request, env);
    if (!userInfo) {
      console.log('[FAVORITES] Unauthorized - no valid user info from token');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = userInfo.sub;
    
    // Update last login time
    await updateLastLogin(env.DB, userId);

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
      userId,
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
    console.error('Error details:', errorMessage);
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
    const userId = await verifyClerkAuth(request, env);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const deleted = await deleteFavorite(env.DB, userId, favoriteId);
    
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

async function handleFeedback(request: Request, env: Env, favoriteId: string): Promise<Response> {
  try {
    const userId = await verifyClerkAuth(request, env);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    
    // TODO: Implement AI report feedback functionality
    // For now, just acknowledge the request
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Feedback received',
      favoriteId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return new Response(JSON.stringify({ error: 'Failed to submit feedback' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

export const favoritesRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/favorites', '');
    const method = request.method;
    
    console.log(`[FAVORITES] ${method} ${url.pathname}${url.search}`);

    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      console.log('[FAVORITES] CORS preflight request');
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

    // Handle /:id/feedback routes
    const feedbackMatch = path.match(/^\/([^\/]+)\/feedback$/);
    if (feedbackMatch && method === 'POST') {
      const favoriteId = feedbackMatch[1];
      return handleFeedback(request, env, favoriteId);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};