# BrightData Zillow API Documentation

This document describes how this project integrates with BrightData's Zillow scraping APIs.

## API Overview

We use two main BrightData datasets:

1. **Zillow Property Search** (`gd_lfqkr8wm13ixtbd8f5`)
   - Searches for properties by location and filters
   - Returns basic property listings with key information

2. **Zillow Property Details** (`gd_m794g571225l6vm7gh`)
   - Fetches comprehensive property details by URL
   - Returns detailed information including photos, history, and nearby schools

## Authentication

All API requests require a Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_BRIGHTDATA_API_TOKEN
```

## API Workflow

### 1. Trigger Data Collection

**Property Search Request:**
```bash
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lfqkr8wm13ixtbd8f5&include_errors=true&type=discover_new&discover_by=input_filters
Content-Type: application/json

{
  "location": "81415",  // ZIP code or location string
  "listingCategory": "House for sale",
  "exact_address": false,
  "HomeType": "SingleFamily",  // Optional filter
  "days_on_zillow": "7 days"   // Optional filter
}
```

**Property Details Request:**
```bash
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_m794g571225l6vm7gh&include_errors=true
Content-Type: application/json

[
  {"url": "https://www.zillow.com/homedetails/123-Main-St/12345678_zpid"}
]
```

**Response:**
```json
{
  "snapshot_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running"
}
```

### 2. Check Progress

```bash
GET https://api.brightdata.com/datasets/v3/progress/{snapshot_id}
```

**Response:**
```json
{
  "status": "ready",  // Options: running, pending, ready, completed, failed
  "snapshot_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "dataset_id": "gd_lfqkr8wm13ixtbd8f5",
  "records": 25,
  "errors": 0,
  "collection_duration": 45.2,
  "message": "Collection completed successfully"
}
```

### 3. Retrieve Data

```bash
GET https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}?format=json
```

**Response Format:**
- Returns JSONL (newline-delimited JSON) by default
- Each line is a complete JSON object representing one property
- Can also return a single JSON array with `format=json` parameter

## Data Structures

### Property Search Result
```typescript
{
  zpid: string;                // Unique property ID
  address: string;            // Full address
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZipcode: string;
  price: number;
  dateSold?: number;
  propertyType: string;
  lotAreaValue?: number;
  lotAreaUnit?: string;
  livingArea?: number;
  livingAreaUnitsShort?: string;
  bathrooms?: number;
  bedrooms?: number;
  url: string;               // Zillow property URL
  latitude?: number;
  longitude?: number;
  // ... other fields
}
```

### Property Details Result
```typescript
{
  zpid: string;
  description: string;
  yearBuilt: number;
  propertyTypeDimension: string;
  priceHistory: Array<{
    date: string;
    price: number;
    priceChangeRate?: number;
    event: string;
  }>;
  taxHistory: Array<{
    time: string;
    taxPaid: number;
    value: number;
  }>;
  schools: Array<{
    name: string;
    type: string;
    level: string;
    grades: string;
    rating?: number;
    distance?: number;
  }>;
  photos: Array<{
    mixedSources: {
      jpeg: Array<{
        url: string;
        width: number;
      }>;
    };
  }>;
  // ... many other detailed fields
}
```

## Error Handling

### Common Errors

1. **"Snapshot does not exist"** (400)
   - The snapshot is still initializing
   - Retry after a short delay

2. **"Snapshot is empty"** (400)
   - No data found for the given filters
   - This is a valid result, not an error

3. **Rate Limiting**
   - BrightData may rate limit requests
   - Implement exponential backoff

4. **Network Errors**
   - Retry with exponential backoff
   - Maximum 20 retries with 30-second intervals

## Implementation Notes

1. **ZPID Handling**
   - ZPIDs are large numbers that can exceed JavaScript's safe integer range
   - Always store and handle ZPIDs as strings
   - Database stores ZPIDs with `.0` suffix for consistency

2. **Data Collection Strategy**
   - Use workflows for durable execution
   - Store raw responses in R2 for backup
   - Process and normalize data before database insertion

3. **Polling Strategy**
   - Poll progress every 30 seconds
   - Maximum wait time: 10 minutes
   - Handle both "ready" and "completed" statuses

4. **Batch Processing**
   - Property details API accepts arrays of URLs
   - Process in reasonable batch sizes to avoid timeouts

## Usage Examples

See the following files for implementation examples:
- `src/handlers/zillow.ts` - Property search implementation
- `src/handlers/zillow-details.ts` - Property details implementation
- `debug-brightdata.js` - Direct API testing script
- `test-brightdata-direct.js` - Simplified API test