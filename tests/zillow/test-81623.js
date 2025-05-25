/**
 * Test script for Zillow data collection in zip code 81623 (Carbondale, CO)
 * This tests the complete workflow from data collection to storage
 * Carbondale is a high-end ski town market near Aspen with expensive properties
 */

const BASE_URL = 'http://localhost:8787';

async function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testZillow81623() {
	console.log('🏠 Testing Zillow Data Collection for Zip Code 81623 (Carbondale, CO)\n');

	try {
		// Step 1: Start the data collection workflow
		console.log('🚀 Step 1: Starting data collection for zip 81623 (Carbondale)...');
		const response = await fetch(`${BASE_URL}/zillow/test-81623`, {
			method: 'POST',
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('❌ Failed to start workflow:', errorText);
			return;
		}

		const result = await response.json();
		console.log('✅ Workflow started successfully:', result);
		console.log(`📋 Instance ID: ${result.id}`);
		console.log(`📍 Target: ${result.testParams.location} (${result.testParams.daysOnZillow})`);
		console.log('');

		// Step 2: Monitor workflow progress until we get a snapshot ID
		console.log('⏳ Step 2: Monitoring workflow for BrightData snapshot...');
		let snapshotId = null;
		let attempts = 0;
		const maxAttempts = 30; // 5 minutes maximum

		while (!snapshotId && attempts < maxAttempts) {
			await wait(10000); // Wait 10 seconds
			attempts++;

			const statusResponse = await fetch(`${BASE_URL}/zillow/status?instanceId=${result.id}`);
			if (statusResponse.ok) {
				const statusData = await statusResponse.json();
				const workflowStatus = statusData.status?.status || 'unknown';
				console.log(`⏰ Attempt ${attempts}: ${workflowStatus}`);

				// Log full status for debugging if needed
				if (statusData.status?.__LOCAL_DEV_STEP_OUTPUTS?.length > 0) {
					console.log(`   📋 Step outputs: ${statusData.status.__LOCAL_DEV_STEP_OUTPUTS.length} steps completed`);
				}

				if (statusData.snapshotId && statusData.snapshotId !== 'pending') {
					snapshotId = statusData.snapshotId;
					console.log(`✅ Got snapshot ID: ${snapshotId}`);
					break;
				}
			}
		}

		if (!snapshotId) {
			console.log('⚠️  Timeout waiting for snapshot ID. Checking recent collections...');

			// Check recent collections to see if one started around this time
			const collectionsResponse = await fetch(`${BASE_URL}/database/collections`);
			if (collectionsResponse.ok) {
				const collections = await collectionsResponse.json();
				console.log('📊 Recent collections:');
				collections.collections.slice(0, 3).forEach((collection) => {
					console.log(`  - Location: ${collection.location}, Status: ${collection.status}, Records: ${collection.record_count}`);
				});
			}
			return;
		}

		// Step 3: Monitor BrightData collection status
		console.log(`\n📊 Step 3: Monitoring BrightData collection status for ${snapshotId}...`);
		let collectionComplete = false;
		let brightDataAttempts = 0;
		const maxBrightDataAttempts = 60; // 10 minutes for BrightData

		while (!collectionComplete && brightDataAttempts < maxBrightDataAttempts) {
			await wait(10000); // Wait 10 seconds
			brightDataAttempts++;

			const debugResponse = await fetch(`${BASE_URL}/debug/brightdata/${snapshotId}`);

			if (debugResponse.status === 200) {
				const brightDataStatus = await debugResponse.json();
				console.log(`✅ BrightData status (attempt ${brightDataAttempts}): ${brightDataStatus.status}`);

				if (brightDataStatus.status === 'ready' || brightDataStatus.status === 'completed') {
					console.log(`🎉 BrightData collection completed! Records: ${brightDataStatus.records_total || 'Unknown'}`);
					collectionComplete = true;
					break;
				}
			} else if (debugResponse.status === 202) {
				console.log(`⏳ BrightData still processing (attempt ${brightDataAttempts})...`);
			} else {
				console.log(`⚠️  Unexpected response status: ${debugResponse.status}`);
			}
		}

		if (!collectionComplete) {
			console.log('⚠️  BrightData collection still in progress after monitoring period.');
			console.log('💡 You can continue monitoring using:');
			console.log(`   curl "${BASE_URL}/debug/brightdata/${snapshotId}"`);
			return;
		}

		// Step 4: Check final results
		console.log('\n📋 Step 4: Checking final results...');

		// Check database for properties in this location
		const propertiesResponse = await fetch(`${BASE_URL}/database/properties?location=81623&limit=10`);
		if (propertiesResponse.ok) {
			const properties = await propertiesResponse.json();
			console.log(`🏘️  Found ${properties.properties.length} properties in database for 81623:`);

			properties.properties.forEach((property, index) => {
				console.log(
					`  ${index + 1}. ZPID: ${property.zpid} - $${property.price?.toLocaleString() || 'Unknown'} - ${
						property.address || 'Address pending'
					}`
				);
			});
		}

		// Check collections table
		const collectionsResponse = await fetch(`${BASE_URL}/database/collections`);
		if (collectionsResponse.ok) {
			const collections = await collectionsResponse.json();
			const carbondale81623 = collections.collections.find((c) => c.location.includes('81623'));

			if (carbondale81623) {
				console.log(`\n📊 Collection Summary:`);
				console.log(`   Location: ${carbondale81623.location}`);
				console.log(`   Status: ${carbondale81623.status}`);
				console.log(`   Records: ${carbondale81623.record_count}`);
				console.log(
					`   File Size: ${carbondale81623.file_size_bytes ? Math.round(carbondale81623.file_size_bytes / 1024) + ' KB' : 'Unknown'}`
				);
			}
		}

		console.log('\n🎯 Test completed successfully for Carbondale, CO (81623)!');
		console.log('🎿 This area should have high-end ski resort properties near Aspen.');
	} catch (error) {
		console.error('❌ Test failed:', error);
	}
}

// Run the test
testZillow81623();
