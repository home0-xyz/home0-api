/**
 * Test script for the Zillow Property Details workflow
 *
 * This script demonstrates:
 * 1. Getting stats on properties that need details
 * 2. Running automatic detail collection
 * 3. Running manual detail collection for specific zpids
 * 4. Checking workflow status
 */

const BASE_URL = 'http://localhost:8787';

async function testPropertyDetailsWorkflow() {
	console.log('🏠 Testing Zillow Property Details Workflow\n');

	try {
		// Step 1: Get current statistics
		console.log('📊 Step 1: Getting property statistics...');
		const statsResponse = await fetch(`${BASE_URL}/zillow/details/stats`);
		const stats = await statsResponse.json();

		console.log('Current statistics:');
		console.log(`- Total properties: ${stats.stats.total_properties}`);
		console.log(`- With details: ${stats.stats.with_details}`);
		console.log(`- Without details: ${stats.stats.without_details}`);
		console.log(`- Added last 24h: ${stats.stats.added_last_24h}`);
		console.log(`- Added last 7 days: ${stats.stats.added_last_7_days}\n`);

		if (stats.stats.without_details === 0) {
			console.log('✅ All properties already have details. Consider running data collection first.');
			return;
		}

		// Step 2: Run automatic detail collection (small batch for testing)
		console.log('🤖 Step 2: Starting automatic detail collection...');
		const autoResponse = await fetch(`${BASE_URL}/zillow/details/auto`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit: 5, // Small batch for testing
				batchSize: 2,
			}),
		});

		const autoResult = await autoResponse.json();
		console.log('Automatic collection started:');
		console.log(`- Workflow ID: ${autoResult.id}`);
		console.log(`- Found properties: ${autoResult.foundProperties}`);
		console.log(`- Batch size: ${autoResult.batchSize}\n`);

		// Step 3: Monitor workflow status
		console.log('⏱️  Step 3: Monitoring workflow status...');
		const workflowId = autoResult.id;
		let completed = false;
		let attempts = 0;
		const maxAttempts = 10;

		while (!completed && attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

			const statusResponse = await fetch(`${BASE_URL}/zillow/details/status?instanceId=${workflowId}`);
			const status = await statusResponse.json();

			console.log(`Status check ${attempts + 1}: ${status.status?.status || 'unknown'}`);

			if (status.status?.status === 'complete') {
				console.log('✅ Workflow completed successfully!');
				console.log('Results:', JSON.stringify(status.status.output, null, 2));
				completed = true;
			} else if (status.status?.status === 'failed') {
				console.log('❌ Workflow failed');
				console.log('Error:', status.status.error);
				break;
			}

			attempts++;
		}

		if (!completed && attempts >= maxAttempts) {
			console.log('⏰ Workflow still running after monitoring period');
		}

		// Step 4: Test manual collection with specific zpids
		console.log('\n🎯 Step 4: Testing manual detail collection...');

		// First, let's get some zpids that don't have details
		const propertiesResponse = await fetch(`${BASE_URL}/database/properties?limit=3&hasDetails=false`);
		const propertiesData = await propertiesResponse.json();

		if (propertiesData.properties && propertiesData.properties.length > 0) {
			const zpids = propertiesData.properties.map((p) => p.zpid);
			console.log(`Found zpids without details: ${zpids.join(', ')}`);

			const manualResponse = await fetch(`${BASE_URL}/zillow/details/collect`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					zpids: zpids,
					batchSize: 2,
					source: 'manual',
				}),
			});

			const manualResult = await manualResponse.json();
			console.log('Manual collection started:');
			console.log(`- Workflow ID: ${manualResult.id}`);
			console.log(`- Requested zpids: ${manualResult.requestedZpids}`);
			console.log(`- Batch size: ${manualResult.batchSize}`);
		} else {
			console.log('No properties found without details for manual testing');
		}

		// Step 5: Final statistics
		console.log('\n📊 Step 5: Final statistics...');
		const finalStatsResponse = await fetch(`${BASE_URL}/zillow/details/stats`);
		const finalStats = await finalStatsResponse.json();

		console.log('Final statistics:');
		console.log(`- Total properties: ${finalStats.stats.total_properties}`);
		console.log(`- With details: ${finalStats.stats.with_details}`);
		console.log(`- Without details: ${finalStats.stats.without_details}`);

		console.log('\n✅ Property details workflow test completed!');
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		if (error.response) {
			const errorBody = await error.response.text();
			console.error('Response:', errorBody);
		}
	}
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	testPropertyDetailsWorkflow();
}

export { testPropertyDetailsWorkflow };
