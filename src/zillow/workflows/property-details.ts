import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../../shared/types/env';
import type { ZillowPropertyDetailsParams } from '../../shared/types/workflow';
import type { BrightDataTriggerResponse } from '../types';
import { storePropertyDetailsInDatabase } from '../../database/schema';
import { WorkflowTracker } from '../../shared/workflow-tracker';

export class PropertyDetails extends WorkflowEntrypoint<Env, ZillowPropertyDetailsParams> {
	async run(event: WorkflowEvent<ZillowPropertyDetailsParams>, step: WorkflowStep) {
		const {
			zpids,
			batchSize = 10,
			source = 'manual',
			collectionId
		} = event.payload;

		// Initialize workflow tracker
		const tracker = new WorkflowTracker(this.env);
		const workflowId = event.instanceId;

		// Log workflow start
		await step.do('log-workflow-start', async () => {
			await tracker.createRun(workflowId, 'property_details', event.payload);
			await tracker.updateStatus(workflowId, 'running');
		});

		console.log(`Starting property details collection for ${zpids.length} properties, batch size: ${batchSize}`);

		try {

		// Step 1: Validate zpids exist in database and get their URLs
		const validPropertiesData = await step.do('validate-zpids-and-get-urls', async () => {
			if (zpids.length === 0) {
				throw new Error('No zpids provided');
			}

			// Check which zpids exist in our database and don't already have details, and get their URLs
			const placeholders = zpids.map(() => '?').join(',');
			const query = `
				SELECT zpid, url FROM properties
				WHERE zpid IN (${placeholders})
				AND (has_details = FALSE OR has_details IS NULL)
			`;

			const result = await this.env.DB.prepare(query).bind(...zpids).all();
			const validPropertiesData = result.results.map((row: any) => ({
				zpid: row.zpid,
				url: row.url
			}));

			console.log(`Found ${validPropertiesData.length} valid properties out of ${zpids.length} requested`);
			return validPropertiesData;
		});

		if (validPropertiesData.length === 0) {
			return {
				success: true,
				message: 'No properties need detail collection',
				processedCount: 0,
				skippedCount: zpids.length,
				completedAt: new Date().toISOString()
			};
		}

		// Step 2: Process properties in batches
		const results = await step.do('process-property-details', async () => {
			const batches = [];
			for (let i = 0; i < validPropertiesData.length; i += batchSize) {
				batches.push(validPropertiesData.slice(i, i + batchSize));
			}

			console.log(`Processing ${batches.length} batches`);
			const batchResults = [];

			for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
				const batch = batches[batchIndex];
				console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} properties`);

				// Generate webhook URLs and secret for this batch
				const webhookSecret = crypto.randomUUID();
				const baseUrl = this.env.WORKER_URL || 'https://home0-platform.peteknowsai.workers.dev';
				const notifyUrl = `${baseUrl}/zillow/webhooks/notify?secret=${webhookSecret}`;
				const endpointUrl = `${baseUrl}/zillow/webhooks/endpoint?secret=${webhookSecret}`;
				const authHeader = `Bearer ${webhookSecret}`;

				try {
					// Submit BrightData request for property details using actual URLs
					const requestBody = batch.map(property => {
						// Use the stored URL if available, fallback to generic URL construction
						const url = property.url || `https://www.zillow.com/homedetails/${property.zpid}_zpid/`;
						return { url: url };
					});

					console.log('Submitting BrightData property details request for batch:', batch.map(p => p.zpid));
					console.log('Using URLs:', requestBody.map(r => r.url));
					console.log('Webhook URLs:', { notify: notifyUrl, endpoint: endpointUrl });

					const queryParams = new URLSearchParams({
						dataset_id: 'gd_m794g571225l6vm7gh',
						include_errors: 'true',
						notify: notifyUrl,
						endpoint: endpointUrl,
						auth_header: authHeader,
						format: 'json',
						uncompressed_webhook: 'true'
					});

					const response = await fetch(
						`https://api.brightdata.com/datasets/v3/trigger?${queryParams}`,
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
						throw new Error(`BrightData API error for batch ${batchIndex + 1}: ${response.status} - ${errorText}`);
					}

					const result = await response.json<BrightDataTriggerResponse>();
					console.log('BrightData request submitted for batch, snapshot_id:', result.snapshot_id);

					// Store snapshot mapping for webhook handling
					await this.env.DB.prepare(
						'INSERT INTO snapshot_workflow_mapping (snapshot_id, workflow_id, workflow_type, webhook_secret) VALUES (?, ?, ?, ?)'
					).bind(result.snapshot_id, event.instanceId, 'property_details', webhookSecret).run();

					// Poll for completion with retries
					let completedData = null;
					let retryCount = 0;
					const maxRetries = 20; // 20 retries with 30s delay = ~10 minutes max

					while (retryCount < maxRetries && !completedData) {
						console.log(`Checking status for batch ${batchIndex + 1}, attempt ${retryCount + 1}`);

						await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

						// First check the progress status
						const progressResponse = await fetch(
							`https://api.brightdata.com/datasets/v3/progress/${result.snapshot_id}`,
							{
								headers: {
									'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
								}
							}
						);

						if (progressResponse.ok) {
							const progressData = await progressResponse.json() as any;
							console.log('Progress status:', {
								status: progressData.status,
								records: progressData.records,
								errors: progressData.errors,
								message: progressData.message
							});

							// If still running, continue polling
							if (progressData.status === 'running' || progressData.status === 'pending') {
								retryCount++;
								continue;
							}

							// If failed, throw error
							if (progressData.status === 'failed') {
								throw new Error(`BrightData collection failed for batch ${batchIndex + 1}: ${progressData.message || 'Unknown error'}`);
							}
						}

						// Try to get the snapshot data
						const statusResponse = await fetch(
							`https://api.brightdata.com/datasets/v3/snapshot/${result.snapshot_id}`,
							{
								headers: {
									'Authorization': `Bearer ${this.env.BRIGHTDATA_API_TOKEN}`
								}
							}
						);

						if (!statusResponse.ok) {
							// Handle specific HTTP status codes
							if (statusResponse.status === 400) {
								const errorText = await statusResponse.text();
								if (errorText.includes('Snapshot is empty')) {
									console.warn(`Batch ${batchIndex + 1} returned empty snapshot - no properties found`);
									completedData = { status: 'ready', data: [] };
									break;
								}
								if (errorText.includes('Snapshot does not exist')) {
									console.warn(`Snapshot not ready yet for batch ${batchIndex + 1}`);
									retryCount++;
									continue;
								}
							}

							retryCount++;
							console.warn(`Status check failed for batch ${batchIndex + 1}, attempt ${retryCount}, status: ${statusResponse.status}`);
							continue;
						}

						const responseText = await statusResponse.text();
						console.log(`Response text length: ${responseText.length}, first 200 chars:`, responseText.substring(0, 200));
						
						try {
							// Try parsing as single JSON
							const parsedData = JSON.parse(responseText);
							
							// If it's an array or has data property, we got the data
							if (Array.isArray(parsedData)) {
								completedData = { status: 'ready', data: parsedData };
							} else if (parsedData.data) {
								completedData = { status: 'ready', data: parsedData.data };
							} else if (parsedData.zpid) {
								// Single property data
								completedData = { status: 'ready', data: [parsedData] };
							}
						} catch (parseError) {
							console.warn('Failed to parse as single JSON, trying NDJSON');

							// Try parsing as NDJSON (newline-delimited JSON)
							const lines = responseText.trim().split('\n');
							const parsedLines = [];

							for (const line of lines) {
								if (line.trim()) {
									try {
										parsedLines.push(JSON.parse(line));
									} catch (lineError) {
										console.warn(`Failed to parse line: ${line.substring(0, 100)}...`);
									}
								}
							}

							if (parsedLines.length > 0) {
								console.log(`Successfully parsed ${parsedLines.length} NDJSON lines`);
								completedData = { status: 'ready', data: parsedLines };
							} else {
								throw new Error(`Failed to parse response for batch ${batchIndex + 1}`);
							}
						}
					}

					if (!completedData) {
						throw new Error(`Batch ${batchIndex + 1} timeout - max retries exceeded`);
					}

					// Extract data from response
					let detailsData = [];
					if (completedData.data && Array.isArray(completedData.data)) {
						detailsData = completedData.data;
					} else if (Array.isArray(completedData)) {
						detailsData = completedData;
					}

					console.log(`Batch ${batchIndex + 1} completed with ${detailsData.length} property details`);

					batchResults.push({
						batchIndex: batchIndex + 1,
						zpids: batch.map(p => p.zpid),
						dataCount: detailsData.length,
						data: detailsData,
						snapshotId: result.snapshot_id
					});

				} catch (error) {
					console.error(`Error processing batch ${batchIndex + 1}:`, error);
					batchResults.push({
						batchIndex: batchIndex + 1,
						zpids: batch.map(p => p.zpid),
						error: error instanceof Error ? error.message : 'Unknown error',
						dataCount: 0
					});
				}
			}

			return batchResults;
		});

		// Step 3: Store detailed property data in database
		const storageResults = await step.do('store-property-details', async () => {
			let totalProcessed = 0;
			let totalErrors = 0;

			for (const batchResult of results) {
				if (batchResult.error || !batchResult.data) {
					totalErrors += batchResult.zpids.length;
					continue;
				}

				for (const property of batchResult.data) {
					try {
						if (!property.zpid) {
							console.warn('Property missing zpid, skipping');
							continue;
						}

						// Use the centralized function to store all property details
						const result = await storePropertyDetailsInDatabase(this.env.DB, property);
						
						if (result.success) {
							totalProcessed++;
						} else {
							totalErrors++;
						}
					} catch (error) {
						totalErrors++;
						console.error(`❌ Error storing details for property ${property.zpid}:`, error);
					}
				}
			}

			return {
				totalProcessed,
				totalErrors,
				batchResults: results.map(r => ({
					batchIndex: r.batchIndex,
					zpidCount: r.zpids.length,
					dataCount: r.dataCount,
					error: r.error || null
				}))
			};
		});

		// Step 4: Store raw data in R2 bucket for backup
		const r2StorageInfo = await step.do('store-details-in-r2', async () => {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const fileName = `zillow-property-details/${source}/${timestamp}-${zpids.length}-properties.json`;

			const allData = results.filter(r => r.data).flatMap(r => r.data);

			if (allData.length === 0) {
				return { fileName: null, recordCount: 0 };
			}

			const metadata: Record<string, string> = {
				source,
				timestamp: new Date().toISOString(),
				requestedCount: zpids.length.toString(),
				processedCount: storageResults.totalProcessed.toString(),
				errorCount: storageResults.totalErrors.toString(),
				collectionId: collectionId || ''
			};

			await this.env.ZILLOW_DATA_BUCKET.put(fileName, JSON.stringify(allData, null, 2), {
				httpMetadata: {
					contentType: 'application/json'
				},
				customMetadata: metadata
			});

			console.log(`Stored detailed data for ${allData.length} properties in R2: ${fileName}`);

			return {
				fileName,
				recordCount: allData.length,
				size: JSON.stringify(allData).length,
				metadata
			};
		});

		// Step 5: Update workflow tracking with final results
		await step.do('log-workflow-completion', async () => {
			// Collect all snapshot IDs from batch results
			const snapshotIds = results.map(r => r.snapshotId).filter(Boolean);

			// Update workflow metrics
			await tracker.updateMetrics(workflowId, {
				totalRequested: zpids.length,
				totalProcessed: storageResults.totalProcessed,
				totalErrors: storageResults.totalErrors,
				totalSkipped: zpids.length - validPropertiesData.length,
				r2FilesCreated: r2StorageInfo.fileName ? 1 : 0,
				r2TotalSizeBytes: r2StorageInfo.size || 0,
				brightdataSnapshots: snapshotIds,
				webhookUsed: true // Property details uses webhooks
			});

			// Link to collection if provided
			if (collectionId) {
				await tracker.linkToCollection(workflowId, collectionId);
			}

			// Set output summary
			const outputSummary = {
				processedCount: storageResults.totalProcessed,
				errorCount: storageResults.totalErrors,
				requestedCount: zpids.length,
				skippedCount: zpids.length - validPropertiesData.length,
				batchResults: storageResults.batchResults,
				r2Storage: r2StorageInfo
			};
			await tracker.setOutputSummary(workflowId, outputSummary);

			// Mark as completed
			await tracker.updateStatus(workflowId, 'completed');
		});

		// Return workflow results
		const finalResults = {
			success: true,
			processedCount: storageResults.totalProcessed,
			errorCount: storageResults.totalErrors,
			requestedCount: zpids.length,
			skippedCount: zpids.length - validPropertiesData.length,
			batchResults: storageResults.batchResults,
			r2Storage: r2StorageInfo,
			completedAt: new Date().toISOString()
		};

		return finalResults;

		} catch (error) {
			// Log workflow failure
			await step.do('log-workflow-error', async () => {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				await tracker.updateStatus(workflowId, 'failed', errorMessage);
			});
			
			throw error; // Re-throw to maintain original error behavior
		}
	}
}