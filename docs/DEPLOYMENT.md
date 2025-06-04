# Deployment Guide for Home0 API

## Prerequisites

1. Cloudflare account with Workers, D1, and R2 enabled
2. Domain `home0.xyz` configured in Cloudflare
3. Wrangler CLI installed and authenticated

## Production Deployment

### 1. Database Setup

First, create the production D1 database:

```bash
# Create production database
wrangler d1 create zillow-data-db --env production

# Note the database ID from the output and update wrangler.prod.jsonc
```

Run all migrations on the production database:

```bash
# Run migrations in order
wrangler d1 execute zillow-data-db --file migrations/0001_create_tables.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0002_fix_zpid_decimals.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0003_add_workflow_id.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0004_add_snapshot_mapping.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0005_add_workflow_tracking.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0006_add_change_tracking.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0007_fix_snapshot_fk.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0008_fix_property_changes_fk.sql --env production
wrangler d1 execute zillow-data-db --file migrations/0010_add_users_table.sql --env production
```

### 2. Environment Variables

Set the following secrets in Cloudflare Dashboard or via CLI:

```bash
# Set API key for protected endpoints
wrangler secret put API_KEY --env production

# Set BrightData API token
wrangler secret put BRIGHTDATA_API_TOKEN --env production

# Set Clerk public key for JWT verification (if using proper verification)
wrangler secret put CLERK_PUBLIC_KEY --env production
```

### 3. Deploy to Production

```bash
# Deploy using production config
wrangler deploy --config wrangler.prod.jsonc --env production
```

### 4. Configure Custom Domain

In Cloudflare Dashboard:

1. Go to Workers & Pages > Your Worker > Settings > Domains & Routes
2. Add custom domain: `api.home0.xyz`
3. Or use the route pattern in wrangler.prod.jsonc

### 5. CORS Configuration

The API already includes CORS headers for Chrome extensions:
- Allows all origins (`*`) for Chrome extension compatibility
- Supports preflight requests
- Includes Authorization header support

## Local Development

For local development matching Chrome extension expectations:

```bash
# Start on port 8787 (expected by Chrome extension)
wrangler dev --port 8787
```

## API Endpoints

The Chrome extension expects these endpoints at `https://api.home0.xyz`:

- `POST /api/favorites` - Create favorite
- `GET /api/favorites` - Get user's favorites
- `DELETE /api/favorites/:id` - Delete favorite
- `POST /api/favorites/:id/feedback` - Submit feedback

## Testing Production Deployment

```bash
# Test API health
curl https://api.home0.xyz/

# Test CORS preflight
curl -X OPTIONS https://api.home0.xyz/api/favorites \
  -H "Origin: chrome-extension://abcdef" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -v

# Test with authorization (replace with actual Clerk JWT)
curl https://api.home0.xyz/api/favorites \
  -H "Authorization: Bearer YOUR_CLERK_JWT_TOKEN"
```

## Monitoring

Monitor your deployment:

1. Cloudflare Dashboard > Workers > Analytics
2. Check D1 database metrics
3. Monitor R2 usage
4. Set up alerts for errors

## Rollback

If needed, rollback to previous version:

```bash
# List deployments
wrangler deployments list

# Rollback to specific version
wrangler rollback [deployment-id]
```

## Security Considerations

1. **API Keys**: Never commit API keys or tokens to git
2. **CORS**: Current config allows all origins for Chrome extension compatibility
3. **Authentication**: Clerk JWT tokens are validated (implement proper RS256 verification in production)
4. **Rate Limiting**: Consider adding rate limiting for production use

## Chrome Extension Configuration

Ensure the Chrome extension is configured to use:
- Development: `http://localhost:8787`
- Production: `https://api.home0.xyz`

The extension should handle authentication via Clerk and send JWT tokens in the Authorization header.