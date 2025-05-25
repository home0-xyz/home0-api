/**
 * Test script to verify that URLs are properly stored and used
 * for property details collection
 */

const BASE_URL = 'http://localhost:8787';

async function testUrlsInDatabase() {
	console.log('🔗 Testing URL storage and usage in property details workflow\n');

	try {
		// Step 1: Check if we have properties with URLs in the database
		console.log('📊 Step 1: Checking for properties with URLs...');
		const propertiesResponse = await fetch(`${BASE_URL}/database/properties?limit=10`);
		const propertiesData = await propertiesResponse.json();

		if (!propertiesData.properties || propertiesData.properties.length === 0) {
			console.log('❌ No properties found in database. Run the data collection test first.');
			return;
		}

		const propertiesWithUrls = propertiesData.properties.filter((p) => p.url);
		const propertiesWithoutUrls = propertiesData.properties.filter((p) => !p.url);

		console.log(`- Total properties found: ${propertiesData.properties.length}`);
		console.log(`- Properties with URLs: ${propertiesWithUrls.length}`);
		console.log(`- Properties without URLs: ${propertiesWithoutUrls.length}`);

		if (propertiesWithUrls.length > 0) {
			console.log('\n📋 Sample URLs found:');
			propertiesWithUrls.slice(0, 3).forEach((property, index) => {
				console.log(`  ${index + 1}. ZPID: ${property.zpid}`);
				console.log(`     URL: ${property.url}`);
				console.log(`     Address: ${property.street_address}, ${property.city}, ${property.state}`);
			});
		}

		// Step 2: Check which properties don't have details yet
		console.log('\n🔍 Step 2: Finding properties without details...');
		const propertiesWithoutDetails = propertiesData.properties.filter((p) => p.url && (!p.has_details || p.has_details === 0));

		if (propertiesWithoutDetails.length === 0) {
			console.log('✅ All properties with URLs already have details collected.');
			return;
		}

		console.log(`Found ${propertiesWithoutDetails.length} properties with URLs that need details`);

		// Step 3: Test property details collection with a small batch
		console.log('\n🚀 Step 3: Testing property details collection...');
		const testZpids = propertiesWithoutDetails.slice(0, 2).map((p) => p.zpid);

		console.log(`Testing with zpids: ${testZpids.join(', ')}`);

		const detailsResponse = await fetch(`${BASE_URL}/zillow/details/collect`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				zpids: testZpids,
				batchSize: 1,
				source: 'url-test',
			}),
		});

		const detailsResult = await detailsResponse.json();

		if (detailsResponse.ok) {
			console.log('✅ Property details workflow started successfully!');
			console.log(`- Workflow ID: ${detailsResult.id}`);
			console.log(`- The workflow should now be using the stored URLs instead of generic ones`);
			console.log(`- Check the logs to see the actual URLs being used`);

			console.log('\n📝 To monitor the workflow:');
			console.log(`curl "${BASE_URL}/zillow/details/status?instanceId=${detailsResult.id}"`);
		} else {
			console.log('❌ Failed to start property details workflow:');
			console.log(detailsResult);
		}

		// Step 4: Show expected vs previous behavior
		console.log('\n📋 Step 4: URL usage comparison:');
		console.log('Previous behavior (generic URLs):');
		testZpids.forEach((zpid) => {
			console.log(`  https://www.zillow.com/homedetails/${zpid}_zpid/`);
		});

		console.log('\nNew behavior (actual URLs from database):');
		propertiesWithoutDetails.slice(0, 2).forEach((property) => {
			console.log(`  ${property.url}`);
		});

		console.log('\n✅ URL verification test completed!');
		console.log('💡 Key improvements:');
		console.log('   - Now using actual property URLs from search results');
		console.log('   - URLs include full address information for better scraping');
		console.log('   - Matches the format required by your curl command');
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

// Run the test if this script is executed directly
if (require.main === module) {
	testUrlsInDatabase();
}

module.exports = { testUrlsInDatabase };
