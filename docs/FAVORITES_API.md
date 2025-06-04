# Favorites API Documentation

## Overview

The Favorites API provides endpoints for the Home0 Chrome extension to manage user's favorite properties. It uses Clerk.js for authentication and integrates with the existing Zillow property data.

## Authentication

All endpoints require a valid Clerk JWT token in the Authorization header:

```
Authorization: Bearer <clerk-jwt-token>
```

## Endpoints

### Create Favorite
```
POST /api/favorites
```

**Request Body:**
```json
{
  "zpid": "123456789",
  "url": "https://www.zillow.com/homedetails/...",
  "metadata": {
    "address": "123 Main St",
    "price": 500000,
    "imageUrl": "https://...",
    "beds": 3,
    "baths": 2,
    "sqft": 1800
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "favoriteId": "uuid-here",
  "message": "Property favorited successfully"
}
```

### Get User's Favorites
```
GET /api/favorites?page=1&pageSize=20
```

**Query Parameters:**
- `page` (optional): Page number, defaults to 1
- `pageSize` (optional): Items per page (1-100), defaults to 20

**Response (200 OK):**
```json
{
  "favorites": [
    {
      "id": "uuid-here",
      "user_id": "clerk-user-id",
      "zpid": "123456789",
      "url": "https://www.zillow.com/...",
      "created_at": "2024-01-15T10:30:00Z",
      "metadata": {
        "address": "123 Main St",
        "price": 500000,
        "beds": 3,
        "baths": 2,
        "sqft": 1800
      }
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20
}
```

### Delete Favorite
```
DELETE /api/favorites/:id
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Favorite removed successfully"
}
```

### Submit Feedback (Future Feature)
```
POST /api/favorites/:id/feedback
```

**Request Body:**
```json
{
  "rating": 5,
  "comment": "Great property analysis"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Feedback received",
  "favoriteId": "uuid-here"
}
```

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "error": "Favorite not found"
}
```

### 409 Conflict
```json
{
  "error": "Property already favorited"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create favorite"
}
```

## CORS Configuration

The API supports CORS for Chrome extensions with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Database Schema

The favorites system uses two tables in the D1 database:

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, -- Clerk user ID
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  profile_image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT -- JSON string
);
```

### Favorites Table
```sql
CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  zpid TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT, -- JSON string
  FOREIGN KEY (user_id) REFERENCES users(id),
  -- Note: No FK constraint on zpid to allow favoriting any property
  UNIQUE(user_id, zpid)
);
```

**Note:** Users are automatically created/updated when they first interact with the API using their Clerk authentication token.

## Testing

Use the test script to verify the API endpoints:

```bash
node tests/favorites/test-favorites-api.js
```

Make sure to:
1. Have the local dev server running (`npm start`)
2. Replace the `TEST_TOKEN` with a valid Clerk JWT token
3. Run the database migrations first:
   ```bash
   # Note: Skip 0009 if you haven't run it yet, as 0010 recreates the favorites table
   wrangler d1 execute zillow-data-db --file migrations/0010_add_users_table.sql
   ```