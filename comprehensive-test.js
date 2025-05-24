/**
 * Comprehensive test of the entire data pipeline with fixes
 */

const BASE_URL = 'http://localhost:8787';

async function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runComprehensiveTest() {
	console.log('🚀 Starting Comprehensive Data Pipeline Test\n');

	try {
		// Step 1: Clear existing data to test fresh collection
		console.log('🧹 Step 1: Clearing existing data...');
		// We'll skip this step to avoid losing existing data

		// Step 2: Collect fresh property data for a different zip code
		console.log('🏠 Step 2: Collecting fresh property data...');
		const searchResponse = await fetch(`${BASE_URL}/zillow/test-80424`, {
			method: 'POST',
		});
		const searchResult = await searchResponse.json();
		console.log('Search started:', searchResult.id);

		// Step 3: Monitor search completion
		console.log('⏳ Step 3: Monitoring search completion...');
		let searchComplete = false;
		for (let i = 0; i < 10; i++) {
			await wait(15000); // Wait 15 seconds

			const statusResponse = await fetch(`${BASE_URL}/zillow/status?instanceId=${searchResult.id}`);
			const statusData = await statusResponse.json();

			console.log(`  Search check ${i + 1}: ${statusData.status?.status || 'unknown'}`);

			if (statusData.status?.status === 'complete') {
				searchComplete = true;
				console.log('✅ Search completed!');
				break;
			} else if (statusData.status?.status === 'failed') {
				console.log('❌ Search failed!');
				return;
			}
		}

		if (!searchComplete) {
			console.log('⚠️ Search taking longer than expected, proceeding with existing data...');
		}

		// Step 4: Get properties without details
		console.log('📊 Step 4: Getting properties without details...');
		const propertiesResponse = await fetch(`${BASE_URL}/database/properties?hasDetails=false&limit=2`);
		const propertiesData = await propertiesResponse.json();

		if (!propertiesData.properties || propertiesData.properties.length === 0) {
			console.log('❌ No properties without details found');
			return;
		}

		const zpids = propertiesData.properties.map((p) => p.zpid);
		console.log(`Found ${zpids.length} properties without details:`, zpids);

		// Show their URLs
		propertiesData.properties.forEach((p) => {
			console.log(`  - ${p.zpid}: ${p.url}`);
		});

		// Step 5: Collect property details
		console.log('\n🔍 Step 5: Collecting property details...');
		const detailsResponse = await fetch(`${BASE_URL}/zillow/details/collect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				zpids: zpids,
				batchSize: 1,
				source: 'comprehensive-test',
			}),
		});

		const detailsResult = await detailsResponse.json();
		console.log('Details collection started:', detailsResult.instanceId);

		// Step 6: Monitor details collection
		console.log('⏳ Step 6: Monitoring details collection (this may take several minutes)...');
		let detailsComplete = false;
		for (let i = 0; i < 20; i++) {
			// Up to 10 minutes
			await wait(30000); // Wait 30 seconds

			const statusResponse = await fetch(`${BASE_URL}/zillow/details/status?instanceId=${detailsResult.instanceId}`);
			const statusData = await statusResponse.json();

			console.log(`  Details check ${i + 1}: ${statusData.status?.status || 'unknown'}`);

			// Show progress
			if (statusData.status?.__LOCAL_DEV_STEP_OUTPUTS) {
				const steps = Object.keys(statusData.status.__LOCAL_DEV_STEP_OUTPUTS);
				console.log(`    Completed steps: ${steps.join(', ')}`);
			}

			if (statusData.status?.status === 'complete') {
				detailsComplete = true;
				console.log('✅ Details collection completed!');
				console.log('Final result:', JSON.stringify(statusData.status.output, null, 2));
				break;
			} else if (statusData.status?.status === 'failed') {
				console.log('❌ Details collection failed!');
				console.log('Error:', JSON.stringify(statusData.status.error, null, 2));
				return;
			}
		}

		// Step 7: Verify stored data
		console.log('\n📋 Step 7: Verifying stored data...');
		for (const zpid of zpids) {
			try {
				const detailResponse = await fetch(`${BASE_URL}/database/property-details?zpid=${zpid}`);
				const detailData = await detailResponse.json();

				if (detailData.property) {
					console.log(`✅ ${zpid}: Details stored successfully`);
					console.log(`   - Photos: ${detailData.photos?.length || 0}`);
					console.log(`   - Description: ${detailData.property.description ? 'Yes' : 'No'}`);
				} else {
					console.log(`❌ ${zpid}: No details found`);
				}
			} catch (error) {
				console.log(`❌ ${zpid}: Error checking details - ${error.message}`);
			}
		}
	} catch (error) {
		console.error('❌ Test failed:', error);
	}
}

runComprehensiveTest();
