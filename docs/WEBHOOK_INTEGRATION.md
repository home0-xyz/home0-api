# Webhook Integration for Property Details Workflow

This document describes the webhook integration added to the property details workflow for BrightData API calls.

## Overview

The property details workflow now supports webhook-based status updates and data delivery from BrightData, eliminating the need for constant polling and improving efficiency.

## Changes Made

### 1. Database Schema
- Added new table `snapshot_workflow_mapping` to store the relationship between BrightData snapshots and workflow instances
- Stores webhook secrets for security validation
- Migration: `migrations/0004_add_snapshot_mapping.sql`

### 2. Environment Configuration
- Added `WEBHOOK_SECRET` to environment types (though individual secrets are generated per request)
- Added `API_KEY` for API authentication
- `WORKER_URL` is used for constructing webhook URLs (defaults to production URL)

### 3. Property Details Workflow Updates
- Generates unique webhook URLs for each batch with security tokens
- Includes webhook parameters in BrightData API trigger:
  - `notify`: URL for status updates
  - `endpoint`: URL for data delivery
  - `auth_header`: Bearer token for additional security
  - `format`: JSON format
  - `uncompressed_webhook`: True for uncompressed data
- Stores snapshot-to-workflow mapping in database for webhook routing

### 4. Webhook Handlers
Updated webhook handlers to support both data collector and property details workflows:
- **Notify Handler** (`/zillow/webhooks/notify`): Receives status updates
- **Endpoint Handler** (`/zillow/webhooks/endpoint`): Receives actual data

Security features:
- Validates webhook secret from query parameter
- Validates auth header for data delivery
- Routes to correct workflow type based on database mapping

## Webhook Flow

1. **Workflow Trigger**
   - Property details workflow generates unique webhook URLs
   - Stores snapshot ID → workflow ID mapping with secret

2. **BrightData Processing**
   - BrightData processes the request
   - Sends status updates to notify URL
   - Delivers data to endpoint URL when complete

3. **Webhook Processing**
   - Validates security (secret and auth header)
   - Looks up workflow instance from snapshot ID
   - Updates workflow with status or data
   - Workflow continues processing

## Example Webhook URLs

```
Notify URL: https://home0-workers.petefromsf.workers.dev/zillow/webhooks/notify?secret=<uuid>
Endpoint URL: https://home0-workers.petefromsf.workers.dev/zillow/webhooks/endpoint?secret=<uuid>
Auth Header: Bearer <same-uuid>
```

## Security Considerations

1. **Unique Secrets**: Each request generates a unique webhook secret
2. **Query Parameter Validation**: Secret validated from URL query parameter
3. **Auth Header Validation**: Additional validation for data delivery
4. **Database Validation**: Secrets stored and validated against database
5. **Workflow Type Routing**: Ensures webhooks route to correct workflow type

## Testing

Use the test script to verify webhook integration:
```bash
node tests/zillow/test-property-details-webhook.js
```

## Future Improvements

1. Add webhook retry handling for failed deliveries
2. Implement webhook signature validation (if BrightData supports it)
3. Add monitoring and alerting for webhook failures
4. Consider using KV store for faster snapshot lookups
5. Add webhook event logging for debugging