# Cloudflare Workflows - Zillow Data Pipeline

This is a Cloudflare Workflows implementation for collecting and processing Zillow real estate data using the BrightData API. The project includes two main workflows: property listing collection and detailed property information gathering.

- Clone this repository to get started with Workflows
- Read the [Workflows announcement blog](https://blog.cloudflare.com/building-workflows-durable-execution-on-workers/) to learn more about what Workflows is and how to build durable, multi-step applications using the Workflows model.
- Review the [Workflows developer documentation](https://developers.cloudflare.com/workflows/) to dive deeper into the Workflows API and how it works.

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

Deploy it to your own Cloudflare account directly:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/workflows-starter)

You can also create a project using this template by using `npm create cloudflare@latest`:

```sh
npm create cloudflare@latest workflows-starter -- --template "cloudflare/workflows-starter"
```

## Development Setup

1. **Clone and install dependencies**:

```bash
git clone <repository>
cd workflows-starter
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
