#!/usr/bin/env node

/**
 * Test script for Paonia 81428 property collection
 * Finds all properties listed in the last week
 */

const BASE_URL = 'http://localhost:8787';

async function startCollection() {
	console.log('🏠 Starting Zillow data collection for Paonia, CO (81428)...\n');
	console.log('📅 Looking for properties listed in the last 7 days\n');

	try {
		// Start the collection using the standard endpoint
		console.log('📡 Triggering data collection...');
		const response = await fetch(`${BASE_URL}/zillow/collect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				location: '81428',
				listingCategory: 'House for sale',
				daysOnZillow: '7 days'
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${await response.text()}`);
		}

		const result = await response.json();
		console.log('✅ Collection started successfully!');
		console.log(`📋 Workflow ID: ${result.id}`);
		console.log(`📊 Status: ${result.status.status}\n`);

		return result.id;
	} catch (error) {
		console.error('❌ Failed to start collection:', error.message);
		throw error;
	}
}

async function checkStatus(instanceId) {
	try {
		const response = await fetch(`${BASE_URL}/zillow/status?instanceId=${instanceId}`);
		const data = await response.json();
		return data.status;
	} catch (error) {
		console.error('❌ Error checking status:', error.message);
		throw error;
	}
}

async function monitorProgress(instanceId) {
	console.log('⏳ Monitoring progress...\n');
	
	let isComplete = false;
	let attempts = 0;
	const maxAttempts = 20; // ~10 minutes

	while (!isComplete && attempts < maxAttempts) {
		attempts++;
		
		try {
			const status = await checkStatus(instanceId);
			console.log(`📊 Check ${attempts}: Status = ${status.status}`);

			if (status.status === 'complete' || status.output) {
				isComplete = true;
				console.log('\n🎉 Collection completed successfully!\n');
				
				if (status.output) {
					console.log('📈 Results:');
					console.log(`   Properties found: ${status.output.propertiesFound || 0}`);
					console.log(`   Properties saved: ${status.output.propertiesSaved || 0}`);
					console.log(`   Snapshot ID: ${status.output.snapshotId || 'N/A'}\n`);
				}
			} else if (status.status === 'errored' || status.status === 'terminated') {
				console.log('\n❌ Collection failed!');
				console.log('Error:', status.error || 'No details available');
				break;
			} else {
				// Still running
				await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
			}
		} catch (error) {
			console.log(`⚠️  Error checking status: ${error.message}`);
			await new Promise(resolve => setTimeout(resolve, 30000));
		}
	}

	if (!isComplete && attempts >= maxAttempts) {
		console.log('\n⏰ Monitoring timeout. Collection may still be running.');
		console.log(`Check status: ${BASE_URL}/zillow/status?instanceId=${instanceId}`);
	}
}

async function queryDatabase() {
	console.log('🔍 Querying database for Paonia properties...\n');
	
	try {
		const response = await fetch(`${BASE_URL}/database/properties?addressZipcode=81428&limit=100`);
		const data = await response.json();
		
		if (data.properties && data.properties.length > 0) {
			console.log(`📊 Found ${data.properties.length} properties in Paonia:\n`);
			
			data.properties.forEach((property, index) => {
				console.log(`${index + 1}. ${property.address}`);
				console.log(`   Price: $${property.price ? property.price.toLocaleString() : 'N/A'}`);
				console.log(`   Beds: ${property.bedrooms || 'N/A'} | Baths: ${property.bathrooms || 'N/A'}`);
				console.log(`   Type: ${property.propertyType || 'N/A'}`);
				console.log(`   ZPID: ${property.zpid}`);
				console.log('');
			});
		} else {
			console.log('📂 No properties found in the database yet.');
		}
	} catch (error) {
		console.error('❌ Error querying database:', error.message);
	}
}

// Main execution
async function main() {
	const command = process.argv[2];
	
	if (command === 'query') {
		// Just query the database
		await queryDatabase();
	} else if (command === 'status' && process.argv[3]) {
		// Check status of specific instance
		const status = await checkStatus(process.argv[3]);
		console.log(JSON.stringify(status, null, 2));
	} else {
		// Run full collection and monitoring
		try {
			const instanceId = await startCollection();
			await monitorProgress(instanceId);
			await queryDatabase();
		} catch (error) {
			process.exit(1);
		}
	}
}

// Show usage if help requested
if (process.argv[2] === 'help' || process.argv[2] === '--help') {
	console.log(`
🏠 Paonia Property Collection Test

Usage:
  node test-paonia-collection.js           # Run collection and monitor
  node test-paonia-collection.js query     # Query database for Paonia properties
  node test-paonia-collection.js status ID # Check status of specific workflow

This will find all properties listed for sale in Paonia, CO (81428) in the last 7 days.
`);
} else {
	main().catch(error => {
		console.error('❌ Unexpected error:', error);
		process.exit(1);
	});
}