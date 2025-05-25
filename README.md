# home0-workers

Cloudflare Workers for the home0 platform - Real estate data pipeline with BrightData integration.

## Overview

Home0 is an open-source platform that helps people use AI and technology to find homes. Built on Cloudflare Workers with durable Workflows, it currently supports Zillow data collection through the BrightData API.

- Built with [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) for reliable, durable execution
- Webhook integration for efficient BrightData API communication
- Scalable architecture designed to support multiple real estate data sources
- AI-ready infrastructure for intelligent property search and analysis

## BrightData API Integration

This project uses [BrightData's Zillow Scraping API](https://brightdata.com/cp/scrapers/api/gd_lfqkr8wm13ixtbd8f5) to collect real estate data:

- **Property Search API** - Search for properties by location with various filters
- **Property Details API** - Get comprehensive property information including photos, history, and nearby schools

For detailed API documentation, see [docs/BRIGHTDATA_API.md](docs/BRIGHTDATA_API.md).

## Features

### 🏠 Zillow Data Collection

- **Property Listings**: Collect basic property information by location
- **Property Details**: Gather detailed information including photos, price history, tax records, and schools
- **Webhook Integration**: Efficient webhook-based status updates and data delivery from BrightData
- **Durable Processing**: Reliable data collection with automatic retries and error handling
- **Data Storage**: Store data in both D1 database and R2 bucket for redundancy
- **API Security**: Secure endpoints with API key authentication

### 🔄 Two-Workflow Architecture

1. **ZillowDataCollector**: Collects basic property listings with zpids
2. **ZillowPropertyDetails**: Collects detailed information for specific properties with webhook support

## API Endpoints

### Property Listings Collection

- `POST /zillow/collect` - Start property collection for a location
- `GET /zillow/status?instanceId={id}` - Check collection status
- `GET /zillow/files?location={location}` - List collected files
- `GET /zillow/download?file={filename}` - Download specific data file
- `POST /zillow/test-81428` - Quick test with zip code 81428

### Property Details Collection

- `POST /zillow/details/collect` - Collect details for specific zpids
- `GET /zillow/details/status?instanceId={id}` - Check details workflow status
- `POST /zillow/details/auto` - Automatically collect details for properties without them
- `GET /zillow/details/stats` - Get statistics on property details coverage

### Database & Utilities

- `GET /database/collections` - View collection metadata
- `GET /database/properties` - Query properties with filters
- `GET /database/property-details` - Query detailed property information
- `GET /database/query` - Execute custom SQL queries

### Webhook Endpoints (BrightData Internal Use)

- `POST /zillow/webhooks/notify` - Receive status notifications
- `POST /zillow/webhooks/endpoint` - Receive data delivery

## Usage Examples

### 1. Collect Property Listings

```bash
# Start data collection for a location
curl -X POST http://localhost:8787/zillow/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "location": "Denver, CO",
    "listingCategory": "House for sale",
    "daysOnZillow": "7 days"
  }'

# Check status
curl "http://localhost:8787/zillow/status?instanceId=WORKFLOW_ID" \
  -H "X-API-Key: your-api-key"
```

### 2. Collect Property Details

```bash
# Automatic collection (finds properties without details)
curl -X POST http://localhost:8787/zillow/details/auto \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "limit": 50,
    "batchSize": 10
  }'

# Manual collection for specific properties
curl -X POST http://localhost:8787/zillow/details/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "zpids": ["12345678", "87654321"],
    "batchSize": 5,
    "source": "manual"
  }'

# Get statistics
curl "http://localhost:8787/zillow/details/stats" \
  -H "X-API-Key: your-api-key"
```

### 3. Query Collected Data

```bash
# Get properties without details
curl "http://localhost:8787/database/properties?hasDetails=false&limit=10" \
  -H "X-API-Key: your-api-key"

# Get properties with details
curl "http://localhost:8787/database/properties?hasDetails=true&limit=5" \
  -H "X-API-Key: your-api-key"

# Get detailed property information
curl "http://localhost:8787/database/property-details?zpid=12345678" \
  -H "X-API-Key: your-api-key"
```

## Testing

### Quick Test Scripts

```bash
# Test basic data collection (zip code 81428)
node test-81428.js

# Test property details workflow
node test-property-details.js
```

### Test Workflow Process

1. **Setup**: Ensure you have properties in the database (run basic collection first)
2. **Stats Check**: Use `/zillow/details/stats` to see how many properties need details
3. **Auto Collection**: Run `/zillow/details/auto` to automatically process properties
4. **Manual Collection**: Use specific zpids with `/zillow/details/collect`
5. **Monitor**: Check workflow status and results

## Configuration

### Environment Variables

- `BRIGHTDATA_API_TOKEN`: Your BrightData API token (required)
- `API_KEY`: API key for endpoint authentication (required)
- `WEBHOOK_SECRET`: Secret for webhook validation (required)
- `WORKER_URL`: Worker URL for webhook generation (optional, auto-detected)

### Workflow Configuration

- **Batch Size**: Process properties in configurable batches (default: 10)
- **Retry Logic**: Automatic retries with exponential backoff
- **Timeout**: Workflows timeout after 3 hours with proper error handling

### Database Schema

The application uses D1 with the following key tables:

- `collections`: Collection metadata and workflow tracking
- `properties`: Basic property information with zpids
- `property_details`: Detailed property information
- `property_photos`: Property images
- `price_history`: Historical pricing data
- `tax_history`: Tax assessment history
- `schools`: Nearby school information
- `snapshot_workflow_mapping`: Webhook request tracking

## Deploy it

Deploy the Home0 platform to your own Cloudflare account:

```sh
npm install
npm run deploy
```

## Development Setup

1. **Clone and install dependencies**:

```bash
git clone <repository>
cd home0-platform
npm install
```

2. **Set up environment variables**:

```bash
# Create .dev.vars file with required credentials
cat > .dev.vars << EOF
BRIGHTDATA_API_TOKEN=your_brightdata_api_token
API_KEY=your_api_key
WEBHOOK_SECRET=your_webhook_secret
EOF
```

3. **Run database migrations**:

```bash
# Local database
npm run migrate:local

# Production database  
npm run migrate:prod
```

4. **Run locally**:

```bash
npm start
```

5. **Test the workflows**:

```bash
# Test basic collection
node tests/zillow/test-81428.js

# Test property details
node tests/zillow/test-property-details.js

# Test webhook integration
node tests/zillow/test-cloud-webhook.js
```

## Architecture

### Workflow Separation Benefits

- **Modularity**: Independent workflows for different data collection phases
- **Reliability**: Can retry detail collection without re-running basic collection
- **Cost Control**: Selective detail collection for high-value properties
- **Scalability**: Process details in manageable batches

### Webhook Integration

The property details workflow uses webhooks for efficient BrightData integration:

- **Unique webhook URLs** generated per batch with security tokens
- **Status notifications** pushed to `/zillow/webhooks/notify`
- **Data delivery** pushed to `/zillow/webhooks/endpoint`
- **Secure validation** using per-request secrets and auth headers

For details, see [docs/WEBHOOK_INTEGRATION.md](docs/WEBHOOK_INTEGRATION.md).

### Error Handling

- Automatic retries with exponential backoff
- Graceful handling of API timeouts
- Comprehensive logging for debugging
- Partial success tracking (some properties may succeed while others fail)

The [Workflows documentation](https://developers.cloudflare.com/workflows/) contains examples, the API reference, and architecture guidance.

## Related Documentation

- [BrightData API Documentation](docs/BRIGHTDATA_API.md) - Detailed API reference
- [Webhook Integration Guide](docs/WEBHOOK_INTEGRATION.md) - Webhook implementation details
- [MCP Servers Guide](docs/MCP_SERVERS.md) - Model Context Protocol integration

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Copyright 2024, home0. Apache 2.0 licensed. See the LICENSE file for details.
