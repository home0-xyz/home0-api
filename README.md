# Home0 Platform - Open Source Real Estate Intelligence

Home0 is an open-source platform that helps people use AI and technology to find homes. Built on Cloudflare Workers with durable Workflows, it currently supports Zillow data collection through the BrightData API.

- Built with [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) for reliable, durable execution
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
- **Durable Processing**: Reliable data collection with automatic retries and error handling
- **Data Storage**: Store data in both D1 database and R2 bucket for redundancy

### 🔄 Two-Workflow Architecture

1. **ZillowDataCollector**: Collects basic property listings with zpids
2. **ZillowPropertyDetails**: Collects detailed information for specific properties

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

## Usage Examples

### 1. Collect Property Listings

```bash
# Start data collection for a location
curl -X POST http://localhost:8787/zillow/collect \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Denver, CO",
    "listingCategory": "House for sale",
    "daysOnZillow": "7 days"
  }'

# Check status
curl "http://localhost:8787/zillow/status?instanceId=WORKFLOW_ID"
```

### 2. Collect Property Details

```bash
# Automatic collection (finds properties without details)
curl -X POST http://localhost:8787/zillow/details/auto \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 50,
    "batchSize": 10
  }'

# Manual collection for specific properties
curl -X POST http://localhost:8787/zillow/details/collect \
  -H "Content-Type: application/json" \
  -d '{
    "zpids": ["12345678", "87654321"],
    "batchSize": 5,
    "source": "manual"
  }'

# Get statistics
curl "http://localhost:8787/zillow/details/stats"
```

### 3. Query Collected Data

```bash
# Get properties without details
curl "http://localhost:8787/database/properties?hasDetails=false&limit=10"

# Get properties with details
curl "http://localhost:8787/database/properties?hasDetails=true&limit=5"

# Get detailed property information
curl "http://localhost:8787/database/property-details?zpid=12345678"
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

### Workflow Configuration

- **Batch Size**: Process properties in configurable batches (default: 10)
- **Retry Logic**: Automatic retries with exponential backoff
- **Timeout**: Workflows timeout after 3 hours with proper error handling

### Database Schema

The application uses D1 with the following key tables:

- `collections`: Collection metadata
- `properties`: Basic property information
- `property_details`: Detailed property information
- `property_photos`: Property images
- `price_history`: Historical pricing data
- `tax_history`: Tax assessment history
- `schools`: Nearby school information

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
cp .dev.vars.example .dev.vars
# Add your BRIGHTDATA_API_TOKEN
```

3. **Run locally**:

```bash
npm run dev
```

4. **Test the workflows**:

```bash
node test-81428.js          # Test basic collection
node test-property-details.js  # Test details collection
```

## Architecture

### Workflow Separation Benefits

- **Modularity**: Independent workflows for different data collection phases
- **Reliability**: Can retry detail collection without re-running basic collection
- **Cost Control**: Selective detail collection for high-value properties
- **Scalability**: Process details in manageable batches

### Error Handling

- Automatic retries with exponential backoff
- Graceful handling of API timeouts
- Comprehensive logging for debugging
- Partial success tracking (some properties may succeed while others fail)

The [Workflows documentation](https://developers.cloudflare.com/workflows/) contains examples, the API reference, and architecture guidance.

## License

Copyright 2024, Cloudflare. Apache 2.0 licensed. See the LICENSE file for details.
