import type { Env } from '../shared/types/env';

export async function handleDebugEnv(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	const hasToken = !!env.BRIGHTDATA_API_TOKEN;
	const tokenPreview = env.BRIGHTDATA_API_TOKEN ?
		env.BRIGHTDATA_API_TOKEN.substring(0, 8) + '...' + env.BRIGHTDATA_API_TOKEN.substring(-4) :
		'not set';

	return Response.json({
		brightDataToken: {
			isSet: hasToken,
			preview: tokenPreview,
			length: env.BRIGHTDATA_API_TOKEN?.length || 0
		},
		note: 'This is for debugging only. Restart wrangler dev if you updated .dev.vars'
	});
}

export async function handleDebugBrightData(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST' && req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const testPayload = [{
			location: '81428',
			listingCategory: 'House for sale',
			exact_address: false,
			HomeType: ''
		}];

		console.log('Testing BrightData API with payload:', testPayload);

		const response = await fetch(
			'https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lfqkr8wm13ixtbd8f5&include_errors=true&type=discover_new&discover_by=input_filters',
			{
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${env.BRIGHTDATA_API_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(testPayload)
			}
		);

		const responseText = await response.text();

		console.log('BrightData API Response Status:', response.status);
		console.log('BrightData API Response Body:', responseText);

		let responseData;
		try {
			responseData = JSON.parse(responseText);
		} catch {
			responseData = responseText;
		}

		return Response.json({
			success: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
			data: responseData,
			payload: testPayload
		});

	} catch (error) {
		return Response.json({
			success: false,
			error: 'BrightData API test failed',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleDebugSnapshotStatus(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed. Use GET with optional ?snapshot_id=<id>' }, { status: 405 });
	}

	const url = new URL(req.url);
	const snapshotId = url.searchParams.get('snapshot_id') || 's_mb2hsmbv28fevj2yyf';

	try {
		console.log('Checking status for snapshot:', snapshotId);

		const statusResponse = await fetch(
			`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}`,
			{
				headers: {
					'Authorization': `Bearer ${env.BRIGHTDATA_API_TOKEN}`
				}
			}
		);

		const responseText = await statusResponse.text();
		console.log('Status API Response Status:', statusResponse.status);
		console.log('Status API Response Body:', responseText);

		let statusData;
		try {
			statusData = JSON.parse(responseText);
		} catch {
			statusData = responseText;
		}

		return Response.json({
			success: statusResponse.ok,
			snapshotId,
			status: statusResponse.status,
			statusText: statusResponse.statusText,
			headers: Object.fromEntries(statusResponse.headers.entries()),
			data: statusData,
			note: 'This shows exactly what BrightData returns for snapshot status'
		});

	} catch (error) {
		return Response.json({
			success: false,
			error: 'Status check failed',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleDebugDownloadReadyData(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST' && req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const url = new URL(req.url);
		const snapshotId = url.searchParams.get('snapshot_id') || 's_mb2hsmbv28fevj2yyf';

		console.log('Downloading ready data for snapshot:', snapshotId);

		// Step 1: Get the snapshot data
		const statusResponse = await fetch(
			`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}`,
			{
				headers: {
					'Authorization': `Bearer ${env.BRIGHTDATA_API_TOKEN}`
				}
			}
		);

		if (!statusResponse.ok) {
			throw new Error(`Status check failed: ${statusResponse.status}`);
		}

		const responseText = await statusResponse.text();
		console.log('Response size:', responseText.length);

		let statusData: any;
		try {
			statusData = JSON.parse(responseText);
		} catch (parseError) {
			console.error('Failed to parse response as single JSON, trying line-by-line parse');

			// Try parsing as newline-delimited JSON (NDJSON)
			const lines = responseText.trim().split('\n');
			console.log('Found', lines.length, 'lines in response');

			if (lines.length === 1) {
				// Single line that failed to parse - this is the problematic case
				console.error('Single line JSON parse failed, response too large or malformed');
				console.log('Response start:', responseText.substring(0, 200));
				console.log('Response end:', responseText.substring(responseText.length - 200));
				throw new Error('Invalid JSON response from BrightData - response too large');
			}

			// Multiple lines - parse as NDJSON array
			const parsedLines: any[] = [];
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line) {
					try {
						parsedLines.push(JSON.parse(line));
					} catch (lineError) {
						console.error(`Failed to parse line ${i}:`, line.substring(0, 100));
					}
				}
			}

			if (parsedLines.length === 0) {
				throw new Error('No valid JSON found in response');
			}

			// If we have multiple objects, the first might be metadata
			if (parsedLines.length > 1 && parsedLines[0].status) {
				statusData = parsedLines[0];
				statusData.data = parsedLines.slice(1); // Rest are data records
			} else {
				// All data, no metadata
				statusData = {
					status: 'ready',
					data: parsedLines
				};
			}
		}

		console.log('Status:', statusData.status);

		if (statusData.status !== 'ready') {
			return Response.json({
				error: `Snapshot not ready, status: ${statusData.status}`,
				snapshotId
			}, { status: 400 });
		}

		// Step 2: Extract the data
		let rawZillowData: any[] = [];

		if (statusData.data && Array.isArray(statusData.data)) {
			console.log('Found embedded data array with length:', statusData.data.length);
			rawZillowData = statusData.data;
		} else if (Array.isArray(statusData)) {
			console.log('Data appears to be the entire response array with length:', statusData.length);
			rawZillowData = statusData;
		} else if (statusData.url) {
			console.log('Using download URL:', statusData.url);
			const dataResponse = await fetch(statusData.url, {
				headers: {
					'Authorization': `Bearer ${env.BRIGHTDATA_API_TOKEN}`
				}
			});

			if (!dataResponse.ok) {
				throw new Error(`Failed to download data: ${dataResponse.status}`);
			}

			rawZillowData = await dataResponse.json() as any[];
		} else {
			throw new Error('No data found in BrightData response');
		}

		// Step 3: Store in R2
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const fileName = `zillow-data/81428/${timestamp}-${snapshotId}-manual.json`;

		const metadata = {
			location: '81428',
			timestamp: new Date().toISOString(),
			snapshotId,
			recordCount: rawZillowData.length.toString(),
			testType: 'manual-download'
		};

		console.log('Storing data to R2 bucket:', fileName);

		await env.ZILLOW_DATA_BUCKET.put(fileName, JSON.stringify(rawZillowData, null, 2), {
			httpMetadata: {
				contentType: 'application/json',
			},
			customMetadata: metadata
		});

		return Response.json({
			success: true,
			snapshotId,
			status: statusData.status,
			recordCount: rawZillowData.length,
			fileName,
			dataSize: JSON.stringify(rawZillowData).length,
			metadata,
			message: 'Successfully downloaded and stored ready snapshot data'
		});

	} catch (error) {
		return Response.json({
			success: false,
			error: 'Failed to download ready data',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}
