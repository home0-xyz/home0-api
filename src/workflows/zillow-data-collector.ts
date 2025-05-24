import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types/env';
import type { ZillowCollectionParams } from '../types/workflow';
import type { BrightDataTriggerResponse } from '../types/zillow';
import { insertCollection, storePropertiesInDatabase } from '../database/schema';

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

		// Step 5: Store in database
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
				snapshot_id: collectionRequest.snapshot_id
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
