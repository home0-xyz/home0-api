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

				// First, check just the status without downloading the full data
				const statusResponse = await fetch(
					`https://api.brightdata.com/datasets/v3/snapshots?dataset_id=gd_lfqkr8wm13ixtbd8f5&status=ready`,
					{
						headers: {
							'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
						}
					}
				);

				if (!statusResponse.ok) {
					throw new Error(`Status check failed: ${statusResponse.status}`);
				}

				const statusData = await statusResponse.json() as any[];
				console.log('Found ready snapshots:', statusData.length || 0);

				// Check if our specific snapshot is in the ready list
				const ourSnapshot = statusData.find((snap: any) => snap.snapshot_id === collectionRequest.snapshot_id);

				if (!ourSnapshot) {
					console.log('Snapshot not yet ready');
					throw new Error('Still processing...'); // Triggers retry
				}

				console.log('Snapshot is ready! Dataset size:', ourSnapshot.dataset_size);

				// Now fetch the actual data using JSONL format
				console.log('Fetching data using JSONL format...');
				const dataResponse = await fetch(
					`https://api.brightdata.com/datasets/v3/snapshot/${collectionRequest.snapshot_id}?format=jsonl`,
					{
						headers: {
							'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
						}
					}
				);

				if (!dataResponse.ok) {
					throw new Error(`Data fetch failed: ${dataResponse.status}`);
				}

				// Get the response as text to handle JSONL format
				const responseText = await dataResponse.text();
				console.log('Data response size:', responseText.length);

				// Parse JSONL - each line is a separate JSON object
				const lines = responseText.trim().split('\n');
				console.log('Found', lines.length, 'properties in JSONL format');

				const data = [];
				for (const line of lines) {
					if (line.trim()) {
						try {
							const property = JSON.parse(line);
							data.push(property);
						} catch (parseError) {
							console.error('Failed to parse JSONL line:', parseError);
							console.error('Line preview:', line.substring(0, 200) + '...');
						}
					}
				}

				console.log('Successfully parsed', data.length, 'properties from JSONL');

				return {
					status: 'ready',
					data: data,
					snapshot_id: collectionRequest.snapshot_id,
					dataset_size: ourSnapshot.dataset_size
				};
			}
		);

		// Step 3: Extract the data (data is now directly available from JSONL)
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
