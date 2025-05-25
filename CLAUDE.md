# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Workers application that implements a Zillow real estate data pipeline using Cloudflare Workflows for durable execution. It collects property listings and detailed information via the BrightData API, storing data in Cloudflare D1 (database) and R2 (object storage).

## Key Commands

```bash
# Development
npm start          # Start local development server (wrangler dev)
npm run deploy     # Deploy to Cloudflare Workers

# Database migrations (run manually)
wrangler d1 execute zillow-data-db --file migrations/0001_create_tables.sql
wrangler d1 execute zillow-data-db --file migrations/0002_fix_zpid_decimals.sql
```

## Local Database Access

To access the local D1 database:
- Use `wrangler d1 execute` command to run SQL queries
- Example: `wrangler d1 execute zillow-data-db --command "SELECT * FROM properties LIMIT 10"`
- For interactive SQL shell: `wrangler d1 database zillow-data-db`
- Database file is typically located in `.wrangler/state/v3/d1/miniflare-D1DatabaseObject`

## Architecture

### Project Structure
The codebase is organized by feature for better maintainability:

```
src/
├── zillow/                  # All Zillow-related functionality
│   ├── workflows/          # Data collection workflows
│   ├── handlers/           # API endpoint handlers
│   └── router.ts           # Zillow-specific routing
├── database/               # Database operations and schema
├── shared/                 # Common types and utilities
│   └── types/             # Shared TypeScript types
├── config.ts              # Configuration constants
└── index.ts               # Main router
```

### BrightData API Integration

The application uses BrightData's Zillow scraping APIs:
- **Property Search API** (`gd_lfqkr8wm13ixtbd8f5`) - Search properties by location and filters
- **Property Details API** (`gd_m794g571225l6vm7gh`) - Get comprehensive property information

API workflow: Trigger collection → Poll status → Retrieve data (JSONL format)
See `docs/BRIGHTDATA_API.md` for detailed API documentation.

### Workflows
The system uses two main Cloudflare Workflows for durable execution:

1. **DataCollector** (`src/zillow/workflows/data-collector.ts`)
   - Collects property listings by location using BrightData API
   - Stores results in D1 database and R2 bucket
   - Handles pagination and retries automatically

2. **PropertyDetails** (`src/zillow/workflows/property-details.ts`)
   - Fetches detailed information for specific properties
   - Stores comprehensive data including photos, price history, tax history, and nearby schools

### API Endpoints

- `POST /workflow` - Start the ZillowDataCollector workflow
- `GET /workflow/:id` - Check workflow status
- `POST /zillow/property-details` - Start property details collection
- `GET /zillow/property-details/:id` - Check property details workflow status
- `GET /database/*` - Query the D1 database directly
- `GET /debug/properties` - Get all properties with pagination
- `GET /debug/r2` - List all R2 bucket objects

### Database Schema

The D1 database uses these main tables:
- `collections` - Tracks data collection runs
- `properties` - Basic property information (zpid as primary key)
- `property_details` - Extended property information
- `property_photos` - Multiple photo URLs per property
- `price_history` - Historical pricing data
- `tax_history` - Tax assessment records
- `schools` - Nearby school information

### Environment Configuration

Required environment variables:
- `BRIGHTDATA_API_TOKEN` - API token for BrightData service

Cloudflare resources configured in `wrangler.jsonc`:
- D1 Database: `zillow-data-db`
- R2 Bucket: `zillow-data-pipeline`
- Workflow bindings: `MY_WORKFLOW`, `ZILLOW_DATA_COLLECTOR`, `ZILLOW_PROPERTY_DETAILS`

## Development Notes

- The project uses TypeScript with strict mode enabled
- Cloudflare Workers compatibility date is set to 2024-10-22
- All zpid values are stored as strings to prevent precision loss with large numbers
- Raw API responses are backed up to R2 for data recovery and debugging
- Workflows include built-in retry logic and error handling
- BrightData API returns JSONL format (newline-delimited JSON)
- Poll BrightData progress endpoint every 30 seconds until data is ready
- Handle "Snapshot does not exist" errors with retries (snapshot still initializing)