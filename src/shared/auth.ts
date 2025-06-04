import type { Env } from './types/env';

/**
 * Validates API key from request headers
 * Returns true if valid, false otherwise
 */
export function validateApiKey(req: Request, env: Env): boolean {
	const apiKey = req.headers.get('X-API-Key');
	
	if (!apiKey || apiKey !== env.API_KEY) {
		return false;
	}
	
	return true;
}

/**
 * Middleware to check API authentication
 * Returns null if authenticated, or an error Response if not
 */
export function requireApiKey(req: Request, env: Env): Response | null {
	if (!validateApiKey(req, env)) {
		return Response.json(
			{ 
				error: 'Unauthorized', 
				message: 'Missing or invalid API key. Include X-API-Key header in your request.' 
			}, 
			{ status: 401 }
		);
	}
	
	return null;
}

/**
 * Check if the endpoint should be protected
 * Some endpoints like webhooks have their own auth
 */
export function shouldRequireApiKey(pathname: string): boolean {
	// Webhooks have their own secret-based auth
	if (pathname.includes('/webhooks/')) {
		return false;
	}
	
	// Favorites API uses Clerk authentication
	if (pathname.startsWith('/api/favorites')) {
		return false;
	}
	
	// Health check endpoint (if you add one)
	if (pathname === '/health') {
		return false;
	}
	
	// Root endpoint can be public
	if (pathname === '/') {
		return false;
	}
	
	// All other endpoints require API key
	return true;
}