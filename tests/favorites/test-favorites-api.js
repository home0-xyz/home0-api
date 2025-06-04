/**
 * Test script for favorites API endpoints
 * Run with: node tests/favorites/test-favorites-api.js
 */

const API_BASE_URL = 'http://localhost:8787'; // Local dev server
const TEST_TOKEN = 'Bearer test-jwt-token'; // Replace with actual Clerk JWT token

async function testCreateFavorite() {
  console.log('\n📝 Testing POST /api/favorites');
  
  const response = await fetch(`${API_BASE_URL}/api/favorites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': TEST_TOKEN
    },
    body: JSON.stringify({
      zpid: '123456789',
      url: 'https://www.zillow.com/homedetails/123-Main-St/123456789_zpid/',
      metadata: {
        address: '123 Main St, Denver, CO',
        price: 500000,
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

async function testCORS() {
  console.log('\n🔒 Testing CORS preflight');
  
  const response = await fetch(`${API_BASE_URL}/api/favorites`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'chrome-extension://abcdefghijklmnop',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization'
    }
  });

  console.log('Status:', response.status);
  console.log('CORS Headers:');
  console.log('  Allow-Origin:', response.headers.get('Access-Control-Allow-Origin'));
  console.log('  Allow-Methods:', response.headers.get('Access-Control-Allow-Methods'));
  console.log('  Allow-Headers:', response.headers.get('Access-Control-Allow-Headers'));
}

async function runTests() {
  console.log('🧪 Starting Favorites API Tests');
  console.log('================================');
  
  try {
    // Test CORS
    await testCORS();
    
    // Test creating a favorite
    const favoriteId = await testCreateFavorite();
    
    // Test getting favorites
    const retrievedId = await testGetFavorites();
    
    // Test deleting a favorite
    if (favoriteId || retrievedId) {
      await testDeleteFavorite(favoriteId || retrievedId);
    }
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run tests
runTests();