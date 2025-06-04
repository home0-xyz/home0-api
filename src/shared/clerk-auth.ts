import type { Env } from './types/env';

export interface ClerkUser {
  userId: string;
  sessionId: string;
  email?: string;
}

export interface ClerkJWTPayload {
  azp: string;
  exp: number;
  iat: number;
  iss: string;
  nbf: number;
  sid: string;
  sub: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
}

async function verifyClerkToken(token: string, env: Env): Promise<ClerkJWTPayload | null> {
  try {
    // Clerk uses RS256 algorithm for JWT signing
    // In production, you should verify the JWT with Clerk's public key
    // For now, we'll decode without verification (NOT FOR PRODUCTION)
    
    // Extract the payload from JWT (base64 decode)
    const [, payloadBase64] = token.split('.');
    if (!payloadBase64) return null;
    
    const payload = JSON.parse(atob(payloadBase64));
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error('Token expired');
      return null;
    }
    
    // In production, verify the signature with Clerk's public key
    // This would require importing the public key and using Web Crypto API
    
    return payload as ClerkJWTPayload;
  } catch (error) {
    console.error('Error verifying Clerk token:', error);
    return null;
  }
}

export async function verifyClerkAuth(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    console.log('[AUTH] No Authorization header provided');
    return null;
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('[AUTH] Invalid Authorization header format (expected Bearer token)');
    return null;
  }
  
  const token = authHeader.substring(7);
  const payload = await verifyClerkToken(token, env);
  
  if (!payload) {
    console.log('[AUTH] Token verification failed');
    return null;
  }
  
  console.log('[AUTH] Successfully authenticated user:', payload.sub);
  return payload.sub; // Return the user ID
}

export async function getClerkUserInfo(request: Request, env: Env): Promise<ClerkJWTPayload | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    console.log('[AUTH] No Authorization header provided');
    return null;
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('[AUTH] Invalid Authorization header format (expected Bearer token)');
    return null;
  }
  
  const token = authHeader.substring(7);
  console.log('[AUTH] Attempting to verify token...');
  const payload = await verifyClerkToken(token, env);
  
  if (!payload) {
    console.log('[AUTH] Token verification failed');
    return null;
  }
  
  console.log('[AUTH] Successfully verified user:', payload.sub);
  return payload;
}

export function extractUserId(payload: ClerkJWTPayload): string {
  return payload.sub;
}