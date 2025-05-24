import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types/env';
import type { ZillowPropertyDetailsParams } from '../types/workflow';
import type { BrightDataTriggerResponse } from '../types/zillow';
import { insertPropertyDetails, insertPropertyPhotos, insertPriceHistory, insertTaxHistory, insertSchools } from '../database/operations';

export class ZillowPropertyDetails extends WorkflowEntrypoint<Env, ZillowPropertyDetailsParams> {
	async run(event: WorkflowEvent<ZillowPropertyDetailsParams>, step: WorkflowStep) {
		const {
			zpids,
			batchSize = 10,
			source = 'manual',
			collectionId
		} = event.payload;

		console.log(`Starting property details collection for ${zpids.length} properties, batch size: ${batchSize}`);

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

				try {
					// Submit BrightData request for property details using actual URLs
					const requestBody = batch.map(property => {
						// Use the stored URL if available, fallback to generic URL construction
						const url = property.url || `https://www.zillow.com/homedetails/${property.zpid}_zpid/`;
						return { url: url };
					});

					console.log('Submitting BrightData property details request for batch:', batch.map(p => p.zpid));
					console.log('Using URLs:', requestBody.map(r => r.url));

					const response = await fetch(
						'https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_m794g571225l6vm7gh&include_errors=true',
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

					// Poll for completion with retries
					let completedData;
					let retryCount = 0;
					const maxRetries = 20; // 20 retries with 30s delay = ~10 minutes max

					while (retryCount < maxRetries) {
						console.log(`Checking status for batch ${batchIndex + 1}, attempt ${retryCount + 1}`);

						await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

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
							}

							retryCount++;
							console.warn(`Status check failed for batch ${batchIndex + 1}, attempt ${retryCount}, status: ${statusResponse.status}`);
							continue;
						}

						const responseText = await statusResponse.text();
						console.log(`Response text length: ${responseText.length}, first 200 chars:`, responseText.substring(0, 200));
						let statusData: any;

						try {
							statusData = JSON.parse(responseText);
							console.log('Parsed as single JSON:', { status: statusData.status, hasData: !!statusData.data, keys: Object.keys(statusData) });

							// If response doesn't have a status field but has zpid, it's likely the actual property data
							if (!statusData.status && statusData.zpid) {
								console.log('Response appears to be property data, not status - treating as ready');
								statusData = {
									status: 'ready',
									data: [statusData]
								};
							}
						} catch (parseError) {
							console.warn('Failed to parse as single JSON:', parseError instanceof Error ? parseError.message : 'Unknown parse error');
							// Handle NDJSON format (multiple JSON objects, one per line)
							const lines = responseText.trim().split('\n');
							console.log(`Response has ${lines.length} lines, attempting NDJSON parse`);

							if (lines.length > 1) {
								const parsedLines = lines.map(line => {
									try {
										return JSON.parse(line.trim());
									} catch {
										return null;
									}
								}).filter(Boolean);

								if (parsedLines.length > 0) {
									console.log(`Successfully parsed ${parsedLines.length} JSON objects from NDJSON`);
									statusData = {
										status: 'ready',
										data: parsedLines
									};
								}
							} else {
								console.warn(`Failed to parse response as JSON: ${responseText.substring(0, 200)}`);
								retryCount++;
								continue;
							}
						}

						if (!statusData) {
							console.warn(`No valid statusData parsed for batch ${batchIndex + 1}`);
							retryCount++;
							continue;
						}

						console.log(`Batch ${batchIndex + 1} status:`, statusData.status);
						console.log(`Batch ${batchIndex + 1} statusData keys:`, Object.keys(statusData));
						console.log(`Batch ${batchIndex + 1} statusData structure:`, {
							hasStatus: 'status' in statusData,
							statusValue: statusData.status,
							statusType: typeof statusData.status,
							hasData: 'data' in statusData,
							dataLength: statusData.data ? statusData.data.length : 'no data'
						});

						// Handle different status responses
						if (statusData.status === 'failed') {
							throw new Error(`BrightData collection failed for batch ${batchIndex + 1}: ${statusData.message || 'Unknown error'}`);
						}

						if (statusData.status === 'running') {
							console.log(`Batch ${batchIndex + 1} still processing: ${statusData.message || 'Processing...'}`);
							retryCount++;
							continue;
						}

						// Status is ready, or we have NDJSON data
						if (statusData.status === 'ready' || statusData.data) {
							completedData = statusData;
							break;
						}

						// If we get here, the status is unknown
						console.warn(`Unknown status for batch ${batchIndex + 1}:`, statusData);
						retryCount++;
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

						// Normalize zpid format to match database (ensure .0 suffix)
						const normalizedZpid = property.zpid.toString().includes('.') ? property.zpid.toString() : `${property.zpid}.0`;
						console.log(`Normalizing zpid: ${property.zpid} -> ${normalizedZpid}`);

						// Create property object with normalized zpid for database operations
						const normalizedProperty = { ...property, zpid: normalizedZpid };

						// Insert property details
						await insertPropertyDetails(this.env.DB, normalizedProperty);

						// Insert photos if available
						if (property.responsive_photos && Array.isArray(property.responsive_photos)) {
							await insertPropertyPhotos(this.env.DB, normalizedZpid, property.responsive_photos);
						}

						// Insert price history if available
						if (property.price_history && Array.isArray(property.price_history)) {
							await insertPriceHistory(this.env.DB, normalizedZpid, property.price_history);
						}

						// Insert tax history if available
						if (property.tax_history && Array.isArray(property.tax_history)) {
							await insertTaxHistory(this.env.DB, normalizedZpid, property.tax_history);
						}

						// Insert schools if available
						if (property.schools && Array.isArray(property.schools)) {
							await insertSchools(this.env.DB, normalizedZpid, property.schools);
						}

						// Mark property as having details
						await this.env.DB.prepare(`
							UPDATE properties
							SET has_details = TRUE, updated_at = CURRENT_TIMESTAMP
							WHERE zpid = ?
						`).bind(normalizedZpid).run();

						totalProcessed++;
						console.log(`✅ Stored details for property ${normalizedZpid}`);

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
					contentType: 'application/json',
				},
				customMetadata: metadata
			});

			console.log('Property details stored to R2 bucket:', fileName);

			return {
				fileName,
				recordCount: allData.length,
				size: JSON.stringify(allData).length
			};
		});

		// Return workflow results
		return {
			success: true,
			requestedCount: zpids.length,
			validCount: validPropertiesData.length,
			processedCount: storageResults.totalProcessed,
			errorCount: storageResults.totalErrors,
			batchCount: results.length,
			r2FileName: r2StorageInfo.fileName,
			r2RecordCount: r2StorageInfo.recordCount,
			batchDetails: storageResults.batchResults,
			completedAt: new Date().toISOString()
		};
	}
}
