import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../../shared/types/env';
import type { ZillowCollectionParams } from '../../shared/types/workflow';
import type { BrightDataTriggerResponse } from '../types';
import { insertCollection, storePropertiesInDatabase } from '../../database/schema';

export class DataCollector extends WorkflowEntrypoint<Env, ZillowCollectionParams> {
	async run(event: WorkflowEvent<ZillowCollectionParams>, step: WorkflowStep) {
		const {
			location,
			listingCategory = "House for sale",
			homeType = "",
			daysOnZillow = "",
			exactAddress = false
		} = event.payload;

		// Determine if we're in production (has a public URL)
		const isProduction = this.env.ENVIRONMENT === 'production' || 
			(this.env.CF && this.env.CF.routes && this.env.CF.routes.length > 0);
		
		// Store workflow ID for webhook mapping
		const workflowId = event.id || crypto.randomUUID();

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
			console.log('Using webhooks:', isProduction);

			// Build URL with webhook parameters if in production
			let apiUrl = 'https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lfqkr8wm13ixtbd8f5&include_errors=true&type=discover_new&discover_by=input_filters';
			
			if (isProduction) {
				// Get the worker URL
				const workerUrl = this.env.WORKER_URL || 'https://home0-platform.peteknowsai.workers.dev';
				
				// Add webhook URLs with security secret
				const secret = this.env.WEBHOOK_SECRET;
				const notifyUrl = encodeURIComponent(`${workerUrl}/zillow/webhooks/notify?secret=${secret}`);
				const endpointUrl = encodeURIComponent(`${workerUrl}/zillow/webhooks/endpoint?secret=${secret}`);
				
				apiUrl += `&notify=${notifyUrl}&endpoint=${endpointUrl}&format=json&uncompressed_webhook=true`;
			}

			const response = await fetch(
				apiUrl,
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
			
			// Store workflow ID mapping for webhooks
			if (isProduction) {
				await this.env.DB.prepare(
					'INSERT INTO collections (id, workflow_id, snapshot_id, location, listing_category, home_type, days_on_zillow, exact_address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
				).bind(
					`temp_${workflowId}`,
					workflowId,
					result.snapshot_id,
					location,
					listingCategory,
					homeType,
					daysOnZillow,
					exactAddress,
					'running'
				).run();
			}
			
			return result;
		});

		// Step 2: Wait for completion (webhook or polling)
		const progressStatus = await step.do(
			'wait-for-brightdata-completion',
			{
				retries: {
					limit: isProduction ? 2 : 24, // Less retries needed with webhooks
					delay: isProduction ? '5 minutes' : '30 seconds',
					backoff: 'exponential'
				},
				timeout: '3 hours'
			},
			async () => {
				// If using webhooks, check if data has been delivered
				if (isProduction) {
					const webhookData = await this.env.DB.prepare(
						'SELECT * FROM collections WHERE workflow_id = ? AND snapshot_id = ?'
					).bind(workflowId, collectionRequest.snapshot_id).first();
					
					if (webhookData && webhookData.status === 'completed') {
						console.log('Data delivered via webhook!');
						return {
							status: 'ready',
							snapshot_id: collectionRequest.snapshot_id,
							records: webhookData.record_count || 0,
							webhookDelivered: true
						};
					}
				}
				console.log('Checking progress for snapshot:', collectionRequest.snapshot_id);

				// Check the dataset progress using the correct endpoint
				const progressResponse = await fetch(
					`https://api.brightdata.com/datasets/v3/progress/${collectionRequest.snapshot_id}`,
					{
						headers: {
							'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
						}
					}
				);

				if (!progressResponse.ok) {
					// Handle specific HTTP status codes
					if (progressResponse.status === 400) {
						const errorText = await progressResponse.text();
						console.log('Progress check error:', errorText);
						if (errorText.includes('Snapshot does not exist') || errorText.includes('does not exist')) {
							console.log('Snapshot not found, might still be initializing...');
							throw new Error('Snapshot not ready yet...'); // Triggers retry
						}
					}
					console.log(`Progress check failed: ${progressResponse.status}`);
					throw new Error(`Progress check failed: ${progressResponse.status} - ${await progressResponse.text()}`);
				}

				const progressData = await progressResponse.json() as {
					status: string;
					snapshot_id: string;
					dataset_id: string;
					records?: number;
					errors?: number;
					collection_duration?: number;
					message?: string;
				};
				console.log('Progress data:', progressData);

				// Check if the progress indicates completion
				if (progressData.status === 'running' || progressData.status === 'pending') {
					console.log(`Collection still ${progressData.status}...`);
					throw new Error('Still processing...'); // Triggers retry
				} else if (progressData.status === 'failed') {
					throw new Error(`Collection failed: ${progressData.message || 'Unknown error'}`);
				} else if (progressData.status === 'ready' || progressData.status === 'completed' || progressData.status === 'complete') {
					console.log('Collection is ready!');
					return {
						status: progressData.status,
						snapshot_id: collectionRequest.snapshot_id,
						records: progressData.records || 0
					};
				}

				// If we get here, we couldn't determine the status
				console.warn('Unknown progress status:', progressData);
				throw new Error(`Unknown progress status from BrightData: ${progressData.status}`);
			}
		);

		// Step 3: Fetch the actual data once we know it's ready
		const completedData = await step.do('fetch-brightdata-data', async () => {
			console.log('Fetching data for ready snapshot:', collectionRequest.snapshot_id);

			// Fetch the actual data using the snapshot endpoint
			const dataResponse = await fetch(
				`https://api.brightdata.com/datasets/v3/snapshot/${collectionRequest.snapshot_id}?format=json`,
				{
					headers: {
						'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
					}
				}
			);

			if (!dataResponse.ok) {
				throw new Error(`Data fetch failed: ${dataResponse.status} - ${await dataResponse.text()}`);
			}

			const responseText = await dataResponse.text();
			console.log('Data response length:', responseText.length);

			// Parse JSONL data
			let parsedData: any[] = [];

			try {
				// Try parsing as single JSON first
				const singleJson = JSON.parse(responseText);
				if (Array.isArray(singleJson)) {
					parsedData = singleJson;
				} else {
					parsedData = [singleJson];
				}
			} catch (parseError) {
				console.log('Not single JSON, trying JSONL parsing');

				// Parse as JSONL (newline-delimited JSON)
				const lines = responseText.trim().split('\n');
				console.log('Found', lines.length, 'lines in JSONL');

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i].trim();
					if (line) {
						try {
							parsedData.push(JSON.parse(line));
						} catch (lineError) {
							console.error(`Failed to parse line ${i}:`, line.substring(0, 100));
						}
					}
				}
			}

			console.log('Successfully parsed', parsedData.length, 'records');
			return {
				status: 'ready',
				data: parsedData,
				snapshot_id: collectionRequest.snapshot_id,
				dataset_size: parsedData.length
			};
		});

		// Step 4: Extract the data (data is now directly available from JSONL)
		const rawZillowData = await step.do('extract-zillow-data', async () => {
			console.log('Extracting data from JSONL response');

			// Data is already parsed from JSONL format
			if (completedData.data && Array.isArray(completedData.data)) {
				console.log('Found parsed data array with length:', completedData.data.length);
				return completedData.data;
			}

			// If we can't find data, throw an error
			throw new Error('No data found in BrightData response');
		});

		// Step 5: Store raw data in R2 bucket
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

		// Step 6: Store in database
		const dbStorageInfo = await step.do('store-data-in-database', async () => {
			const collectionId = `collection_${Date.now()}_${collectionRequest.snapshot_id}`;

			console.log('Storing collection metadata in database...');

			// Insert collection record
			await insertCollection(this.env.DB, {
				id: collectionId,
				location,
				listing_category: listingCategory,
				home_type: homeType,
				days_on_zillow: daysOnZillow,
				exact_address: exactAddress,
				snapshot_id: collectionRequest.snapshot_id,
				workflow_id: workflowId
			});

			// Store properties in database
			await storePropertiesInDatabase(this.env.DB, rawZillowData, collectionId);

			// Update collection as completed
			await this.env.DB.prepare(`
				UPDATE collections
				SET status = 'completed', completed_at = CURRENT_TIMESTAMP, record_count = ?, r2_file_path = ?
				WHERE id = ?
			`).bind(rawZillowData.length, storageInfo.fileName, collectionId).run();

			console.log('Database storage completed');

			return {
				collectionId,
				storedRecords: rawZillowData.length
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
			collectionId: dbStorageInfo.collectionId,
			storedInDatabase: dbStorageInfo.storedRecords,
			completedAt: new Date().toISOString()
		};
	}
}
