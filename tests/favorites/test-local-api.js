/**
 * Test script for local favorites API
 * Run with: node tests/favorites/test-local-api.js
 */

// Create a mock JWT token for testing (NOT FOR PRODUCTION)
// In real usage, this would come from Clerk authentication
function createMockJWT() {
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  
  const payload = {
    azp: "test-app",
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    iss: "https://clerk.test",
    nbf: Math.floor(Date.now() / 1000),
    sid: "test-session-id",
    sub: "test-user-123", // User ID
    email: "test@example.com",
    first_name: "Test",
    last_name: "User"
  };
  
  // Base64 encode (not a real signature, just for local testing)
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const fakeSignature = "fake-signature-for-testing";
  
  return `${encodedHeader}.${encodedPayload}.${fakeSignature}`;
}

const API_BASE_URL = 'http://localhost:8787';
const TEST_TOKEN = `Bearer ${createMockJWT()}`;

async function testCreateFavorite() {
  console.log('\n📝 Testing POST /api/favorites');
  
  const response = await fetch(`${API_BASE_URL}/api/favorites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': TEST_TOKEN
    },
    body: JSON.stringify({
      zpid: '225421572', // Real zpid from local database
      url: 'https://www.zillow.com/homedetails/Delta-CO/225421572_zpid/',
      metadata: {
        address: 'Property in Delta, CO',
        price: 450000,
        beds: 3,
        baths: 2,
        sqft: 1800
      }
    })
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
  
  return data.favoriteId;
}

async function testGetFavorites() {
  console.log('\n📋 Testing GET /api/favorites');
  
  const response = await fetch(`${API_BASE_URL}/api/favorites?page=1&pageSize=10`, {
    headers: {
      'Authorization': TEST_TOKEN
    }
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
  
  return data.favorites?.[0]?.id;
}

async function testDeleteFavorite(favoriteId) {
  console.log(`\n🗑️  Testing DELETE /api/favorites/${favoriteId}`);
  
  const response = await fetch(`${API_BASE_URL}/api/favorites/${favoriteId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': TEST_TOKEN
    }
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
}

async function runTests() {
  console.log('🧪 Testing Favorites API on Local Dev Server');
  console.log('============================================');
  console.log('Mock JWT User ID: test-user-123');
  
  try {
    // Test creating a favorite
    const favoriteId = await testCreateFavorite();
    
    // Test getting favorites
    await testGetFavorites();
    
    // Test deleting a favorite
    if (favoriteId) {
      await testDeleteFavorite(favoriteId);
    }
    
    console.log('\n✅ All tests completed!');
    console.log('\n📌 Note: To test with the Chrome extension:');
    console.log('   1. Make sure the extension is configured for http://localhost:8787');
    console.log('   2. The extension will use real Clerk JWT tokens');
    console.log('   3. Check the browser console for any CORS or authentication errors');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run tests
runTests();