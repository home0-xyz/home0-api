/**
 * Debug script to test BrightData API directly
 */

const BASE_URL = 'http://localhost:8787';

async function testBrightDataAPI() {
	console.log('🔍 Testing BrightData API directly...\n');

	try {
		// First, get a property with a URL from our database
		console.log('📊 Step 1: Getting a property with URL from database...');
		const propertiesResponse = await fetch(`${BASE_URL}/database/properties?limit=1`);
		const propertiesData = await propertiesResponse.json();

		if (!propertiesData.properties || propertiesData.properties.length === 0) {
			console.log('❌ No properties found in database');
			return;
		}

		const property = propertiesData.properties[0];
		console.log(`Found property: ${property.zpid} - ${property.url}`);

		// Test a minimal property details collection
		console.log('\n🚀 Step 2: Testing property details collection...');
		const detailsResponse = await fetch(`${BASE_URL}/zillow/details/collect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				zpids: [property.zpid],
				batchSize: 1,
				source: 'debug-test',
			}),
		});

		const detailsResult = await detailsResponse.json();
		console.log('Details collection started:', detailsResult);

		if (detailsResult.instanceId) {
			console.log('\n⏳ Step 3: Monitoring workflow progress...');

			// Monitor for up to 2 minutes
			for (let i = 0; i < 8; i++) {
				await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15 seconds

				const statusResponse = await fetch(`${BASE_URL}/zillow/details/status?instanceId=${detailsResult.instanceId}`);
				const statusData = await statusResponse.json();

				console.log(`Check ${i + 1}: Status = ${statusData.status?.status || 'unknown'}`);

				if (statusData.status?.status === 'complete') {
					console.log('✅ Workflow completed successfully!');
					console.log('Result:', JSON.stringify(statusData.status.output, null, 2));
					break;
				} else if (statusData.status?.status === 'failed') {
					console.log('❌ Workflow failed!');
					console.log('Error:', JSON.stringify(statusData.status.error, null, 2));
					break;
				}

				// Show current step information
				if (statusData.status?.__LOCAL_DEV_STEP_OUTPUTS) {
					const steps = Object.keys(statusData.status.__LOCAL_DEV_STEP_OUTPUTS);
					console.log(`  Current steps completed: ${steps.join(', ')}`);
				}
			}
		}
	} catch (error) {
		console.error('❌ Error:', error);
	}
}

testBrightDataAPI();
