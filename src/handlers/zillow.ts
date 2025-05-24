import type { Env } from '../types/env';
import type { ZillowCollectionParams } from '../types/workflow';

export async function handleZillowCollect(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const params = await req.json<ZillowCollectionParams>();

		// Validate required fields
		if (!params.location) {
			return Response.json({ error: 'location is required' }, { status: 400 });
		}

		let instance = await env.ZILLOW_DATA_COLLECTOR.create({ params });

		return Response.json({
			id: instance.id,
			status: await instance.status(),
			message: `Started data collection for location: ${params.location}`
		});
	} catch (error) {
		return Response.json({
			error: 'Invalid request body',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 400 });
	}
}

export async function handleZillowStatus(req: Request, env: Env): Promise<Response> {
	const url = new URL(req.url);
	const instanceId = url.searchParams.get('instanceId');

	if (!instanceId) {
		return Response.json({ error: 'instanceId parameter required' }, { status: 400 });
	}

	try {
		let instance = await env.ZILLOW_DATA_COLLECTOR.get(instanceId);
		return Response.json({
			status: await instance.status(),
		});
	} catch (error) {
		return Response.json({ error: 'Instance not found' }, { status: 404 });
	}
}

export async function handleZillowFiles(req: Request, env: Env): Promise<Response> {
	const url = new URL(req.url);
	const location = url.searchParams.get('location');
	const prefix = location ? `zillow-data/${location}/` : 'zillow-data/';

	try {
		const objects = await env.ZILLOW_DATA_BUCKET.list({ prefix });

		const files = objects.objects.map(obj => ({
			key: obj.key,
			size: obj.size,
			uploaded: obj.uploaded,
			metadata: obj.customMetadata
		}));

		return Response.json({
			files,
			truncated: objects.truncated
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to list files',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleZillowDownload(req: Request, env: Env): Promise<Response> {
	const url = new URL(req.url);
	const fileName = url.searchParams.get('file');

	if (!fileName) {
		return Response.json({ error: 'file parameter required' }, { status: 400 });
	}

	try {
		const object = await env.ZILLOW_DATA_BUCKET.get(fileName);
		if (!object) {
			return Response.json({ error: 'File not found' }, { status: 404 });
		}

		return new Response(object.body, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${fileName.split('/').pop()}"`
			}
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to download file',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleZillowTest81428(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST' && req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const testParams: ZillowCollectionParams = {
			location: '81428',
			listingCategory: 'House for sale',
			daysOnZillow: '7 days',
			homeType: '',
			exactAddress: false
		};

		let instance = await env.ZILLOW_DATA_COLLECTOR.create({ params: testParams });

		return Response.json({
			id: instance.id,
			status: await instance.status(),
			message: `Started test data collection for zip code 81428 (last 7 days)`,
			testParams,
			instructions: {
				checkStatus: `GET /zillow/status?instanceId=${instance.id}`,
				listFiles: `GET /zillow/files?location=81428`,
				downloadFile: `GET /zillow/download?file=<filename>`
			}
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to start test collection',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}
