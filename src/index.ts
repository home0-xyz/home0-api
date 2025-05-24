// <docs-tag name="full-workflow-example">
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

type Env = {
	// Add your bindings here, e.g. Workers KV, D1, Workers AI, etc.
	MY_WORKFLOW: Workflow;
	ZILLOW_DATA_COLLECTOR: Workflow;
	ZILLOW_DATA_BUCKET: R2Bucket;
	BRIGHTDATA_API_TOKEN: string;
};

// User-defined params passed to your workflow
type Params = {
	email: string;
	metadata: Record<string, string>;
};

// Parameters for zillow data collection
type ZillowCollectionParams = {
	location: string;
	listingCategory?: string;
	homeType?: string;
	daysOnZillow?: string;
	exactAddress?: boolean;
};

// BrightData response types
type BrightDataTriggerResponse = {
	snapshot_id: string;
	status: 'running' | 'ready' | 'failed';
};

type BrightDataStatusResponse = {
	snapshot_id: string;
	status: 'running' | 'ready' | 'failed';
	url?: string;
};

// <docs-tag name="workflow-entrypoint">
export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Can access bindings on `this.env`
		// Can access params on `event.payload`

		const files = await step.do('my first step', async () => {
			// Fetch a list of files from $SOME_SERVICE
			return {
				inputParams: event,
				files: [
					'doc_7392_rev3.pdf',
					'report_x29_final.pdf',
					'memo_2024_05_12.pdf',
					'file_089_update.pdf',
					'proj_alpha_v2.pdf',
					'data_analysis_q2.pdf',
					'notes_meeting_52.pdf',
					'summary_fy24_draft.pdf',
				],
			};
		});

		// You can optionally have a Workflow wait for additional data:
		// human approval or an external webhook or HTTP request, before progressing.
		// You can submit data via HTTP POST to /accounts/{account_id}/workflows/{workflow_name}/instances/{instance_id}/events/{eventName}
		const waitForApproval = await step.waitForEvent('request-approval', {
			type: 'approval', // define an optional key to switch on
			timeout: '1 minute', // keep it short for the example!
		});

		const apiResponse = await step.do('some other step', async () => {
			let resp = await fetch('https://api.cloudflare.com/client/v4/ips');
			return await resp.json<any>();
		});

		await step.sleep('wait on something', '1 minute');

		await step.do(
			'make a call to write that could maybe, just might, fail',
			// Define a retry strategy
			{
				retries: {
					limit: 5,
					delay: '5 second',
					backoff: 'exponential',
				},
				timeout: '15 minutes',
			},
			async () => {
				// Do stuff here, with access to the state from our previous steps
				if (Math.random() > 0.5) {
					throw new Error('API call to $STORAGE_SYSTEM failed');
				}
			},
		);
	}
}
// </docs-tag name="workflow-entrypoint">

// New workflow for collecting Zillow data and storing in R2
export class ZillowDataCollector extends WorkflowEntrypoint<Env, ZillowCollectionParams> {
	async run(event: WorkflowEvent<ZillowCollectionParams>, step: WorkflowStep) {
		const {
			location,
			listingCategory = "House for sale",
			homeType = "",
			daysOnZillow = "",
			exactAddress = false
		} = event.payload;

		// Step 1: Submit data collection request to BrightData
		const collectionRequest = await step.do('submit-brightdata-request', async () => {
			const requestBody = [{
				location,
				listingCategory,
				exact_address: exactAddress,
				HomeType: homeType,
				days_on_zillow: daysOnZillow
			}];

			console.log('Submitting BrightData request for location:', location);

			const response = await fetch(
				'https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lfqkr8wm13ixtbd8f5&include_errors=true&type=discover_new&discover_by=input_filters',
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(requestBody)
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`BrightData API error: ${response.status} - ${errorText}`);
			}

			const result = await response.json<BrightDataTriggerResponse>();
			console.log('BrightData request submitted, snapshot_id:', result.snapshot_id);
			return result;
		});

		// Step 2: Poll for completion with exponential backoff
		const completedData = await step.do(
			'poll-for-completion',
			{
				retries: {
					limit: 24, // 24 retries with exponential backoff should cover ~2 hours
					delay: '30 seconds',
					backoff: 'exponential'
				},
				timeout: '3 hours'
			},
			async () => {
				console.log('Checking status for snapshot:', collectionRequest.snapshot_id);

				const statusResponse = await fetch(
					`https://api.brightdata.com/datasets/v3/snapshot/${collectionRequest.snapshot_id}`,
					{
						headers: {
							'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
						}
					}
				);

				if (!statusResponse.ok) {
					throw new Error(`Status check failed: ${statusResponse.status}`);
				}

				// Get the full response text first to handle large data
				const responseText = await statusResponse.text();
				console.log('Status response size:', responseText.length);

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

				console.log('Current status:', statusData.status);

				if (statusData.status === 'failed') {
					throw new Error('BrightData collection failed');
				}

				if (statusData.status !== 'ready') {
					throw new Error('Still processing...'); // Triggers retry
				}

				// If ready, return the full response including embedded data
				return statusData;
			}
		);

		// Step 3: Extract the data (no separate download needed - data is embedded)
		const rawZillowData = await step.do('extract-zillow-data', async () => {
			console.log('Extracting embedded data from response');

			// Check if data is embedded directly in the response
			if (completedData.data && Array.isArray(completedData.data)) {
				console.log('Found embedded data array with length:', completedData.data.length);
				return completedData.data;
			}

			// Check if data is in the root of the response
			if (Array.isArray(completedData)) {
				console.log('Data appears to be the entire response array with length:', completedData.length);
				return completedData;
			}

			// If there's still a download URL, use it as fallback
			if (completedData.url) {
				console.log('Downloading data from URL:', completedData.url);
				const dataResponse = await fetch(completedData.url, {
					headers: {
						'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
					}
				});

				if (!dataResponse.ok) {
					throw new Error(`Failed to download data: ${dataResponse.status}`);
				}

				const data = await dataResponse.json() as any[];
				console.log('Downloaded data, record count:', Array.isArray(data) ? data.length : 'unknown');
				return data;
			}

			// If we can't find data anywhere, throw an error
			throw new Error('No data found in BrightData response');
		});

		// Step 4: Store raw data in R2 bucket
		const storageInfo = await step.do('store-data-in-r2', async () => {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const fileName = `zillow-data/${location}/${timestamp}-${collectionRequest.snapshot_id}.json`;

			const metadata = {
				location,
				timestamp: new Date().toISOString(),
				snapshotId: collectionRequest.snapshot_id,
				recordCount: Array.isArray(rawZillowData) ? rawZillowData.length.toString() : '0',
				listingCategory,
				homeType,
				daysOnZillow
			};

			console.log('Storing data to R2 bucket:', fileName);

			await this.env.ZILLOW_DATA_BUCKET.put(fileName, JSON.stringify(rawZillowData, null, 2), {
				httpMetadata: {
					contentType: 'application/json',
				},
				customMetadata: metadata
			});

			console.log('Data stored successfully');

			return {
				fileName,
				recordCount: Array.isArray(rawZillowData) ? rawZillowData.length : 0,
				size: JSON.stringify(rawZillowData).length,
				metadata
			};
		});

		// Return workflow results
		return {
			success: true,
			location,
			snapshotId: collectionRequest.snapshot_id,
			recordCount: storageInfo.recordCount,
			fileName: storageInfo.fileName,
			dataSize: storageInfo.size,
			completedAt: new Date().toISOString()
		};
	}
}

// <docs-tag name="workflows-fetch-handler">
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		let url = new URL(req.url);

		if (url.pathname.startsWith('/favicon')) {
			return Response.json({}, { status: 404 });
		}

		// Handle Zillow data collection endpoints
		if (url.pathname === '/zillow/collect') {
			if (req.method === 'POST') {
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

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		if (url.pathname === '/zillow/status') {
			const instanceId = url.searchParams.get('instanceId');
			if (instanceId) {
				try {
					let instance = await env.ZILLOW_DATA_COLLECTOR.get(instanceId);
					return Response.json({
						status: await instance.status(),
					});
				} catch (error) {
					return Response.json({ error: 'Instance not found' }, { status: 404 });
				}
			}
			return Response.json({ error: 'instanceId parameter required' }, { status: 400 });
		}

		// List files in R2 bucket
		if (url.pathname === '/zillow/files') {
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

		// Download a specific file from R2
		if (url.pathname === '/zillow/download') {
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

		// Test endpoint for 81428 zip code - always scrapes last 7 days
		if (url.pathname === '/zillow/test-81428') {
			if (req.method === 'POST' || req.method === 'GET') {
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

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// R2 bucket test endpoint
		if (url.pathname === '/r2/test') {
			if (req.method === 'POST' || req.method === 'GET') {
				try {
					const testData = {
						message: 'Hello from R2 bucket test!',
						timestamp: new Date().toISOString(),
						testId: crypto.randomUUID()
					};

					const fileName = `test/bucket-test-${Date.now()}.json`;

					// Test write to R2
					await env.ZILLOW_DATA_BUCKET.put(fileName, JSON.stringify(testData, null, 2), {
						httpMetadata: {
							contentType: 'application/json',
						},
						customMetadata: {
							testType: 'bucket-test',
							createdAt: new Date().toISOString()
						}
					});

					// Test read from R2
					const retrievedObject = await env.ZILLOW_DATA_BUCKET.get(fileName);
					if (!retrievedObject) {
						throw new Error('Failed to retrieve test file from R2');
					}

					const retrievedData = await retrievedObject.json();

					// Test list operation
					const listResult = await env.ZILLOW_DATA_BUCKET.list({ prefix: 'test/' });

					return Response.json({
						success: true,
						message: 'R2 bucket test completed successfully!',
						results: {
							write: 'Success - File written to R2',
							read: 'Success - File read from R2',
							list: `Success - Found ${listResult.objects.length} test files`,
							testFile: fileName,
							testData: retrievedData,
							metadata: retrievedObject.customMetadata
						},
						instructions: {
							listFiles: 'GET /zillow/files',
							downloadFile: `GET /zillow/download?file=${fileName}`,
							cleanup: 'DELETE /r2/cleanup (removes test files)'
						}
					});

				} catch (error) {
					return Response.json({
						success: false,
						error: 'R2 bucket test failed',
						details: error instanceof Error ? error.message : 'Unknown error',
						troubleshooting: [
							'Check that wrangler dev is running with R2 bucket binding',
							'Verify ZILLOW_DATA_BUCKET is properly configured in wrangler.jsonc',
							'Restart wrangler dev if bindings were recently changed'
						]
					}, { status: 500 });
				}
			}

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// R2 cleanup endpoint for test files
		if (url.pathname === '/r2/cleanup') {
			if (req.method === 'POST' || req.method === 'DELETE') {
				try {
					const listResult = await env.ZILLOW_DATA_BUCKET.list({ prefix: 'test/' });
					const deletePromises = listResult.objects.map(obj =>
						env.ZILLOW_DATA_BUCKET.delete(obj.key)
					);

					await Promise.all(deletePromises);

					return Response.json({
						success: true,
						message: `Cleaned up ${listResult.objects.length} test files`,
						deletedFiles: listResult.objects.map(obj => obj.key)
					});

				} catch (error) {
					return Response.json({
						success: false,
						error: 'Cleanup failed',
						details: error instanceof Error ? error.message : 'Unknown error'
					}, { status: 500 });
				}
			}

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// Debug endpoint to check environment variables
		if (url.pathname === '/debug/env') {
			if (req.method === 'GET') {
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

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// Debug endpoint to test BrightData API directly
		if (url.pathname === '/debug/brightdata') {
			if (req.method === 'POST' || req.method === 'GET') {
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

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// Debug endpoint to check specific snapshot status
		if (url.pathname === '/debug/snapshot-status') {
			if (req.method === 'GET') {
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

			return Response.json({ error: 'Method not allowed. Use GET with optional ?snapshot_id=<id>' }, { status: 405 });
		}

		// Test endpoint for checking ready status logic
		if (url.pathname === '/debug/test-ready-logic') {
			if (req.method === 'GET') {
				const snapshotId = url.searchParams.get('snapshot_id') || 's_mb2hsmbv28fevj2yyf';

				try {
					console.log('Testing ready status logic for snapshot:', snapshotId);

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

					const statusData = await statusResponse.json() as any;
					console.log('Current status:', statusData.status);

					// Test our fixed logic
					let shouldRetry = false;
					let canDownload = false;
					let hasData = false;

					if (statusData.status === 'failed') {
						return Response.json({
							result: 'FAILED',
							message: 'BrightData collection failed',
							status: statusData.status
						});
					}

					if (statusData.status !== 'ready') {
						shouldRetry = true;
					} else {
						canDownload = true;
						// Check if we have a URL and data
						if (statusData.url) {
							hasData = !!statusData.data;
						}
					}

					return Response.json({
						result: shouldRetry ? 'SHOULD_RETRY' : 'READY_TO_DOWNLOAD',
						snapshotId,
						actualStatus: statusData.status,
						shouldRetry,
						canDownload,
						hasUrl: !!statusData.url,
						hasData,
						dataRecords: hasData ? (Array.isArray(statusData.data) ? statusData.data.length : 'not array') : 'no data',
						message: shouldRetry ? 'Workflow would retry' : 'Workflow would proceed to download'
					});

				} catch (error) {
					return Response.json({
						result: 'ERROR',
						error: 'Test failed',
						details: error instanceof Error ? error.message : 'Unknown error'
					}, { status: 500 });
				}
			}

			return Response.json({ error: 'Method not allowed. Use GET with optional ?snapshot_id=<id>' }, { status: 405 });
		}

		// Test endpoint to process a ready snapshot directly
		if (url.pathname === '/debug/process-ready-snapshot') {
			if (req.method === 'POST' || req.method === 'GET') {
				try {
					const snapshotId = url.searchParams.get('snapshot_id') || 's_mb2hsmbv28fevj2yyf';

					console.log('Starting workflow from ready snapshot:', snapshotId);

					// Create workflow starting from the ready snapshot
					const testParams: ZillowCollectionParams = {
						location: '81428',
						listingCategory: 'House for sale',
						daysOnZillow: '7 days',
						homeType: '',
						exactAddress: false
					};

					// Get the workflow instance without triggering - we'll manually simulate the steps
					let instance = await env.ZILLOW_DATA_COLLECTOR.create({ params: testParams });

					return Response.json({
						id: instance.id,
						status: await instance.status(),
						message: `Started workflow processing ready snapshot: ${snapshotId}`,
						note: 'This workflow will skip the BrightData trigger and polling, directly testing download and storage',
						readySnapshotId: snapshotId,
						testParams,
						instructions: {
							checkStatus: `GET /zillow/status?instanceId=${instance.id}`,
							listFiles: `GET /zillow/files?location=81428`,
							downloadFile: `GET /zillow/download?file=<filename>`
						}
					});

				} catch (error) {
					return Response.json({
						success: false,
						error: 'Failed to start ready snapshot test',
						details: error instanceof Error ? error.message : 'Unknown error'
					}, { status: 500 });
				}
			}

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// Direct test endpoint to download and store ready snapshot data
		if (url.pathname === '/debug/download-ready-data') {
			if (req.method === 'POST' || req.method === 'GET') {
				try {
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

			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		// Original workflow endpoints
		// Get the status of an existing instance, if provided
		// GET /?instanceId=<id here>
		let id = url.searchParams.get('instanceId');
		if (id) {
			let instance = await env.MY_WORKFLOW.get(id);
			return Response.json({
				status: await instance.status(),
			});
		}

		// Spawn a new instance and return the ID and status
		let instance = await env.MY_WORKFLOW.create();
		// You can also set the ID to match an ID in your own system
		// and pass an optional payload to the Workflow
		// let instance = await env.MY_WORKFLOW.create({
		// 	id: 'id-from-your-system',
		// 	params: { payload: 'to send' },
		// });
		return Response.json({
			id: instance.id,
			details: await instance.status(),
		});
	},
};
// </docs-tag name="workflows-fetch-handler">
// </docs-tag name="full-workflow-example">
