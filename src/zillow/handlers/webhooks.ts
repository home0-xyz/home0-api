import type { Env } from '../../shared/types/env';
import type { BrightDataWebhookPayload, BrightDataDataDelivery } from '../types';

/**
 * Validate webhook request security
 */
function validateWebhookSecurity(req: Request, env: Env): { valid: boolean; error?: string; secret?: string } {
	// Check secret in query parameter
	const url = new URL(req.url);
	const secret = url.searchParams.get('secret');
	
	if (!secret) {
		return { valid: false, error: 'Missing secret parameter' };
	}
	
	// For webhook requests, we validate against the stored secret in the database
	// The secret is generated per-request and stored in snapshot_workflow_mapping
	return { valid: true, secret };
}

/**
 * Handle BrightData status webhook notifications
 * Called when collection status changes (started, progress, completed, failed)
 */
export async function handleBrightDataNotify(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	// Validate security
	const security = validateWebhookSecurity(req, env);
	if (!security.valid) {
		console.error('Webhook security validation failed:', security.error);
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	
	const webhookSecret = security.secret!;

	try {
		const payload = await req.json<BrightDataWebhookPayload>();
		console.log('BrightData webhook notification:', JSON.stringify(payload));

		// Validate required fields
		if (!payload.snapshot_id || !payload.status) {
			return Response.json({ 
				error: 'Invalid payload', 
				details: 'Missing required fields: snapshot_id, status' 
			}, { status: 400 });
		}

		// Extract snapshot_id and workflow_id from the webhook
		const { snapshot_id, status, progress, error } = payload;
		
		// Find the workflow instance by snapshot_id and validate secret
		const mapping = await getWorkflowMappingBySnapshot(env, snapshot_id);
		
		if (!mapping) {
			console.error('No workflow found for snapshot:', snapshot_id);
			return Response.json({ error: 'Workflow not found' }, { status: 404 });
		}
		
		// Validate the webhook secret
		if (mapping.webhook_secret !== webhookSecret) {
			console.error('Invalid webhook secret for snapshot:', snapshot_id);
			return Response.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Update workflow with status based on workflow type
		if (mapping.workflow_type === 'data_collector') {
			const instance = await env.ZILLOW_DATA_COLLECTOR.get(mapping.workflow_id);
			// Store the webhook data for the workflow to process
			await instance.update({
				webhookStatus: status,
				webhookProgress: progress,
				webhookError: error,
				webhookReceived: true
			});
		} else if (mapping.workflow_type === 'property_details') {
			const instance = await env.ZILLOW_PROPERTY_DETAILS.get(mapping.workflow_id);
			// Store the webhook data for the workflow to process
			await instance.update({
				webhookStatus: status,
				webhookProgress: progress,
				webhookError: error,
				webhookReceived: true
			});
		}

		return Response.json({ success: true, processed: snapshot_id });
	} catch (error) {
		console.error('Error processing webhook:', error);
		return Response.json({ 
			error: 'Failed to process webhook',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

/**
 * Handle BrightData data delivery endpoint
 * Called when data is ready and delivered directly
 */
export async function handleBrightDataEndpoint(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	// Validate security
	const security = validateWebhookSecurity(req, env);
	if (!security.valid) {
		console.error('Webhook security validation failed:', security.error);
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	
	const webhookSecret = security.secret!;

	try {
		const contentType = req.headers.get('content-type') || '';
		
		// BrightData sends data as JSONL (newline-delimited JSON)
		let data: any[];
		let text: string = '';
		if (contentType.includes('application/x-ndjson') || contentType.includes('application/jsonl')) {
			text = await req.text();
			data = text.trim().split('\n').map(line => JSON.parse(line));
		} else {
			// Fallback to regular JSON
			data = await req.json();
			text = JSON.stringify(data);
		}

		// Validate data
		if (!Array.isArray(data) || data.length === 0) {
			return Response.json({ 
				error: 'Invalid data payload', 
				details: 'Expected non-empty array of records' 
			}, { status: 400 });
		}

		console.log(`BrightData data delivery received: ${data.length} records`);

		// Extract snapshot_id from headers or first record
		const snapshotId = req.headers.get('x-snapshot-id') || data[0]?.snapshot_id;
		
		if (!snapshotId) {
			return Response.json({ 
				error: 'No snapshot_id found', 
				details: 'Expected snapshot_id in x-snapshot-id header or data records' 
			}, { status: 400 });
		}

		// Find the workflow instance and validate secret
		const mapping = await getWorkflowMappingBySnapshot(env, snapshotId);
		
		if (!mapping) {
			// Store in temporary location if no workflow found
			const tempKey = `temp-webhooks/${snapshotId}/data-${Date.now()}.jsonl`;
			await env.ZILLOW_DATA_BUCKET.put(tempKey, text, {
				customMetadata: {
					snapshot_id: snapshotId,
					received_at: new Date().toISOString(),
					record_count: data.length.toString()
				}
			});
			
			console.warn('No workflow found, stored data temporarily:', tempKey);
			return Response.json({ success: true, stored: tempKey });
		}
		
		// Validate the webhook secret from auth header
		const authHeader = req.headers.get('authorization');
		if (!authHeader || authHeader !== `Bearer ${mapping.webhook_secret}`) {
			console.error('Invalid auth header for snapshot:', snapshotId);
			return Response.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Update workflow with data based on workflow type
		if (mapping.workflow_type === 'data_collector') {
			const instance = await env.ZILLOW_DATA_COLLECTOR.get(mapping.workflow_id);
			await instance.update({
				dataDelivered: true,
				dataRecordCount: data.length,
				deliveredData: data
			});
		} else if (mapping.workflow_type === 'property_details') {
			const instance = await env.ZILLOW_PROPERTY_DETAILS.get(mapping.workflow_id);
			await instance.update({
				dataDelivered: true,
				dataRecordCount: data.length,
				deliveredData: data
			});
		}

		return Response.json({ 
			success: true, 
			processed: snapshotId,
			records: data.length 
		});
	} catch (error) {
		console.error('Error processing data delivery:', error);
		return Response.json({ 
			error: 'Failed to process data delivery',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

/**
 * Helper function to get workflow mapping by snapshot ID
 */
async function getWorkflowMappingBySnapshot(env: Env, snapshotId: string): Promise<{
	workflow_id: string;
	workflow_type: string;
	webhook_secret: string;
} | null> {
	// Check the snapshot_workflow_mapping table
	const result = await env.DB.prepare(
		'SELECT workflow_id, workflow_type, webhook_secret FROM snapshot_workflow_mapping WHERE snapshot_id = ? LIMIT 1'
	).bind(snapshotId).first<{
		workflow_id: string;
		workflow_type: string;
		webhook_secret: string;
	}>();
	
	return result || null;
}