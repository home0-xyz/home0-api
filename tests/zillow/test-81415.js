/**
 * Test script for Zillow data collection in zip code 81415
 * This tests the complete workflow from data collection to storage
 */

const BASE_URL = 'http://localhost:8787';

async function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testZillow81415() {
	console.log('🏠 Testing Zillow Data Collection for Zip Code 81415\n');

	try {
		// Step 1: Start the data collection workflow
		console.log('🚀 Step 1: Starting data collection for zip 81415...');
		const response = await fetch(`${BASE_URL}/zillow/test-81415`, {
			method: 'POST',
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('❌ Failed to start workflow:', errorText);
			return;
		}

		const result = await response.json();
		console.log('✅ Workflow started successfully!');
		console.log(`- Workflow ID: ${result.id}`);
		console.log(`- Location: ${result.location}`);
		console.log(`- Snapshot ID: ${result.snapshotId}`);

		// Step 2: Monitor BrightData status directly
		console.log('\n⏳ Step 2: Monitoring BrightData collection status...');
		const snapshotId = result.snapshotId;
		const workflowId = result.id;
		let brightDataComplete = false;
		let attempts = 0;
		const maxAttempts = 20; // 10 minutes max

		while (!brightDataComplete && attempts < maxAttempts) {
			await wait(30000); // Wait 30 seconds
			attempts++;

			try {
				// Check BrightData status directly
				const debugResponse = await fetch(`${BASE_URL}/debug/brightdata/${snapshotId}`);
				const debugData = await debugResponse.json();

				console.log(`Check ${attempts}: BrightData status = ${debugData.status} (HTTP ${debugResponse.status})`);

				if (debugResponse.status === 200) {
					// Status is "ready" - collection completed
					console.log('✅ BrightData collection completed!');
					console.log(`- Records collected: ${debugData.recordCount || 'Unknown'}`);
					console.log(`- File size: ${debugData.fileSize || 'Unknown'}`);
					brightDataComplete = true;
				} else if (debugResponse.status === 202) {
					// Still processing
					console.log(`   Still processing... Progress: ${debugData.progress || 'Unknown'}%`);
				} else {
					console.log(`   Unexpected status code: ${debugResponse.status}`);
				}
			} catch (error) {
				console.log(`   Error checking status: ${error.message}`);
			}
		}

		if (!brightDataComplete) {
			console.log('⚠️  BrightData collection still in progress after monitoring period');
			console.log('   You can continue monitoring manually or check back later');
		}

		// Step 3: Check workflow completion
		console.log('\n🔄 Step 3: Checking workflow completion...');
		let workflowComplete = false;
		let workflowAttempts = 0;
		const maxWorkflowAttempts = 5;

		while (!workflowComplete && workflowAttempts < maxWorkflowAttempts) {
			await wait(15000); // Wait 15 seconds
			workflowAttempts++;

			try {
				const statusResponse = await fetch(`${BASE_URL}/zillow/status?instanceId=${workflowId}`);
				const statusData = await statusResponse.json();

				console.log(`Workflow check ${workflowAttempts}: ${statusData.status?.status || 'unknown'}`);

				if (statusData.status?.status === 'complete') {
					workflowComplete = true;
					console.log('✅ Workflow completed successfully!');

					const output = statusData.status.output;
					if (output) {
						console.log(`- Collection ID: ${output.collectionId}`);
						console.log(`- Properties stored: ${output.propertiesStored}`);
						console.log(`- R2 file: ${output.r2FileName}`);
					}
				} else if (statusData.status?.status === 'failed') {
					console.log('❌ Workflow failed!');
					console.log('Error:', statusData.status.error);
					break;
				}
			} catch (error) {
				console.log(`   Error checking workflow: ${error.message}`);
			}
		}

		// Step 4: Check database results
		console.log('\n📊 Step 4: Checking database results...');
		try {
			const dbResponse = await fetch(`${BASE_URL}/database/properties?location=81415&limit=20`);
			const dbData = await dbResponse.json();

			if (dbData.properties && dbData.properties.length > 0) {
				console.log(`✅ Found ${dbData.properties.length} properties in database for 81415:`);

				dbData.properties.forEach((property, index) => {
					console.log(`  ${index + 1}. ZPID: ${property.zpid}`);
					console.log(`     Address: ${property.street_address}, ${property.city}, ${property.state}`);
					console.log(`     Price: $${property.price?.toLocaleString() || 'N/A'}`);
					console.log(`     Bedrooms: ${property.bedrooms || 'N/A'}, Bathrooms: ${property.bathrooms || 'N/A'}`);
					console.log(`     Has Details: ${property.has_details ? 'Yes' : 'No'}`);
					console.log('');
				});
			} else {
				console.log('❌ No properties found in database for 81415');
			}
		} catch (error) {
			console.log(`❌ Error checking database: ${error.message}`);
		}

		// Step 5: Check collections table
		console.log('📋 Step 5: Checking collections table...');
		try {
			const collectionsResponse = await fetch(`${BASE_URL}/database/collections`);
			const collectionsData = await collectionsResponse.json();

			if (collectionsData.collections) {
				const recentCollections = collectionsData.collections.filter((c) => c.location.includes('81415')).slice(0, 3);

				if (recentCollections.length > 0) {
					console.log('Recent 81415 collections:');
					recentCollections.forEach((collection, index) => {
						console.log(`  ${index + 1}. ID: ${collection.id}`);
						console.log(`     Location: ${collection.location}`);
						console.log(`     Status: ${collection.status}`);
						console.log(`     Record Count: ${collection.record_count}`);
						console.log(`     Created: ${collection.created_at}`);
						console.log('');
					});
				} else {
					console.log('No collections found for 81415');
				}
			}
		} catch (error) {
			console.log(`❌ Error checking collections: ${error.message}`);
		}

		console.log('✅ Test completed for zip code 81415!');
		console.log('\n💡 Next steps:');
		console.log('   - Run property details collection if needed');
		console.log('   - Check R2 bucket for raw data files');
		console.log('   - Monitor for any additional properties');
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		if (error.response) {
			try {
				const errorBody = await error.response.text();
				console.error('Response:', errorBody);
			} catch (e) {
				console.error('Could not read error response');
			}
		}
	}
}

// Run the test
testZillow81415();
