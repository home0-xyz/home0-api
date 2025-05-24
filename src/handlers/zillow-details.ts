import type { Env } from '../types/env';
import type { ZillowPropertyDetailsParams } from '../types/workflow';

interface AutoDetailsRequest {
	limit?: number;
	batchSize?: number;
	collectionId?: string;
}

export async function handleZillowDetailsCollect(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const params = await req.json<ZillowPropertyDetailsParams>();

		// Validate required fields
		if (!params.zpids || !Array.isArray(params.zpids) || params.zpids.length === 0) {
			return Response.json({ error: 'zpids array is required and cannot be empty' }, { status: 400 });
		}

		// Validate zpids are strings/numbers
		const invalidZpids = params.zpids.filter(zpid => !zpid || (typeof zpid !== 'string' && typeof zpid !== 'number'));
		if (invalidZpids.length > 0) {
			return Response.json({ error: 'All zpids must be valid strings or numbers' }, { status: 400 });
		}

		// Convert all zpids to strings
		const normalizedParams = {
			...params,
			zpids: params.zpids.map(zpid => String(zpid))
		};

		let instance = await env.ZILLOW_PROPERTY_DETAILS.create({ params: normalizedParams });

		return Response.json({
			id: instance.id,
			status: await instance.status(),
			message: `Started property details collection for ${params.zpids.length} properties`,
			requestedZpids: params.zpids.length,
			batchSize: params.batchSize || 10
		});
	} catch (error) {
		return Response.json({
			error: 'Invalid request body',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 400 });
	}
}

export async function handleZillowDetailsStatus(req: Request, env: Env): Promise<Response> {
	const url = new URL(req.url);
	const instanceId = url.searchParams.get('instanceId');

	if (!instanceId) {
		return Response.json({ error: 'instanceId parameter required' }, { status: 400 });
	}

	try {
		let instance = await env.ZILLOW_PROPERTY_DETAILS.get(instanceId);
		return Response.json({
			status: await instance.status(),
		});
	} catch (error) {
		return Response.json({ error: 'Instance not found' }, { status: 404 });
	}
}

export async function handleZillowDetailsAuto(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const body = await req.json<AutoDetailsRequest>();
		const limit = body.limit || 50;
		const batchSize = body.batchSize || 10;
		const collectionId = body.collectionId;

		// Query for properties without details
		let query: string;
		let bindings: any[] = [limit];

		if (collectionId) {
			query = `
				SELECT zpid FROM properties
				WHERE collection_id = ?
				AND (has_details = FALSE OR has_details IS NULL)
				ORDER BY created_at DESC
				LIMIT ?
			`;
			bindings = [collectionId, limit];
		} else {
			query = `
				SELECT zpid FROM properties
				WHERE (has_details = FALSE OR has_details IS NULL)
				AND created_at > datetime('now', '-7 days')
				ORDER BY created_at DESC
				LIMIT ?
			`;
		}

		const result = await env.DB.prepare(query).bind(...bindings).all();
		const zpids = result.results.map((row: any) => row.zpid);

		if (zpids.length === 0) {
			return Response.json({
				message: 'No properties found that need detail collection',
				foundProperties: 0
			});
		}

		const params: ZillowPropertyDetailsParams = {
			zpids,
			batchSize,
			source: 'auto',
			collectionId
		};

		let instance = await env.ZILLOW_PROPERTY_DETAILS.create({ params });

		return Response.json({
			id: instance.id,
			status: await instance.status(),
			message: `Started automatic property details collection`,
			foundProperties: zpids.length,
			batchSize,
			collectionId: collectionId || null,
			instructions: {
				checkStatus: `GET /zillow/details/status?instanceId=${instance.id}`
			}
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to start automatic detail collection',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleZillowDetailsStats(req: Request, env: Env): Promise<Response> {
	try {
		// Get statistics about properties with/without details
		const stats = await env.DB.prepare(`
			SELECT
				COUNT(*) as total_properties,
				COUNT(CASE WHEN has_details = TRUE THEN 1 END) as with_details,
				COUNT(CASE WHEN has_details = FALSE OR has_details IS NULL THEN 1 END) as without_details,
				COUNT(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 END) as added_last_24h,
				COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as added_last_7_days
			FROM properties
		`).first();

		// Get recent collections info
		const recentCollections = await env.DB.prepare(`
			SELECT
				id,
				location,
				record_count,
				status,
				created_at,
				completed_at
			FROM collections
			ORDER BY created_at DESC
			LIMIT 10
		`).all();

		return Response.json({
			stats,
			recentCollections: recentCollections.results
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to get property statistics',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}
