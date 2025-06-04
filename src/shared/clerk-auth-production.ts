import type { Env } from './types/env';
import { ClerkJWTPayload } from './clerk-auth';

/**
 * Production-ready Clerk JWT verification using RS256
 * This requires the Clerk public key to be set as an environment variable
 */

// Convert PEM to CryptoKey
async function pemToPublicKey(pem: string): Promise<CryptoKey> {
  // Remove PEM headers and newlines
  const pemContents = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  // Decode base64
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Import as CryptoKey
  return await crypto.subtle.importKey(
    'spki',
    bytes,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );
}

export async function verifyClerkTokenProduction(
  token: string, 
  publicKeyPem: string
): Promise<ClerkJWTPayload | null> {
  try {
    const [headerBase64, payloadBase64, signatureBase64] = token.split('.');
    
    if (!headerBase64 || !payloadBase64 || !signatureBase64) {
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(atob(payloadBase64)) as ClerkJWTPayload;
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error('Token expired');
      return null;
    }
    
    // Verify issuer
    if (!payload.iss || !payload.iss.startsWith('https://clerk.')) {
      console.error('Invalid issuer');
      return null;
    }
    
    // Get public key
    const publicKey = await pemToPublicKey(publicKeyPem);
    
    // Prepare data for verification
    const data = new TextEncoder().encode(`${headerBase64}.${payloadBase64}`);
    
    // Decode signature
    const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    
    // Verify signature
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      data
    );
    
    if (!isValid) {
      console.error('Invalid signature');
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('Error verifying Clerk token:', error);
    return null;
  }
}

// Wrapper that uses the appropriate verification based on environment
export async function verifyClerkAuthSecure(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  // Use production verification if public key is available
  if (env.CLERK_PUBLIC_KEY) {
    const payload = await verifyClerkTokenProduction(token, env.CLERK_PUBLIC_KEY);
    return payload ? payload.sub : null;
  }
  
  // Fall back to development mode (decode without verification)
  console.warn('CLERK_PUBLIC_KEY not set, using insecure JWT decoding');
  const [, payloadBase64] = token.split('.');
  if (!payloadBase64) return null;
  
  try {
    const payload = JSON.parse(atob(payloadBase64)) as ClerkJWTPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}