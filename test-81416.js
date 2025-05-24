#!/usr/bin/env node

/**
 * Test script for 81416 zip code data collection
 * This script will start the data collection and monitor progress
 */

const BASE_URL = 'http://localhost:8787';

async function runTest() {
	console.log('🏠 Starting Zillow data collection test for zip code 81416...\n');

	try {
		// Start the test collection
		console.log('📡 Triggering data collection...');
		const response = await fetch(`${BASE_URL}/zillow/test-81416`, {
			method: 'POST',
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${await response.text()}`);
		}

		const result = await response.json();
		console.log('✅ Collection started successfully!');
		console.log(`📋 Instance ID: ${result.id}`);
		console.log(`📍 Location: ${result.testParams.location}`);
		console.log(`📅 Days on Zillow: ${result.testParams.daysOnZillow}`);
		console.log(`🏷️  Listing Category: ${result.testParams.listingCategory}\n`);

		// Monitor progress
		console.log('⏳ Monitoring BrightData progress...\n');
		const instanceId = result.id;

		// First, get the snapshot ID from the workflow
		let snapshotId = null;
		console.log('🔍 Getting snapshot ID from workflow...');

		// Wait a moment for the workflow to create the snapshot
		await new Promise((resolve) => setTimeout(resolve, 5000));

		try {
			const statusResponse = await fetch(`${BASE_URL}/zillow/status?instanceId=${instanceId}`);
			const status = await statusResponse.json();

			if (status.status.__LOCAL_DEV_STEP_OUTPUTS && status.status.__LOCAL_DEV_STEP_OUTPUTS.length > 0) {
				snapshotId = status.status.__LOCAL_DEV_STEP_OUTPUTS[0].snapshot_id;
				console.log(`📋 Snapshot ID: ${snapshotId}\n`);
			} else {
				throw new Error('No snapshot ID found in workflow status');
			}
		} catch (error) {
			console.error('❌ Failed to get snapshot ID:', error.message);
			return;
		}

		let isComplete = false;
		let attempts = 0;
		const maxAttempts = 20; // Monitor for ~10 minutes

		while (!isComplete && attempts < maxAttempts) {
			attempts++;

			try {
				// Check BrightData snapshot status directly
				const brightDataResponse = await fetch(`${BASE_URL}/debug/snapshot-status?snapshot_id=${snapshotId}`);
				const brightDataStatus = await brightDataResponse.json();

				const actualStatus = brightDataStatus.data?.status || brightDataStatus.status;
				console.log(`📊 Check ${attempts}: BrightData Status = ${actualStatus}`);

				if (actualStatus === 'ready' || actualStatus === 'complete') {
					isComplete = true;
					console.log('\n🎉 BrightData collection completed successfully!');
					console.log(`📈 Records found: ${brightDataStatus.data?.records || brightDataStatus.records || 'unknown'}\n`);

					// Now wait for workflow to process the data
					console.log('⏳ Waiting for workflow to process data and move to property details...\n');

					// Wait a bit longer for the workflow to complete all steps
					await new Promise((resolve) => setTimeout(resolve, 30000));

					// Show results
					await showResults();
				} else if (actualStatus === 'failed') {
					console.log('\n❌ BrightData collection failed!');
					console.log('Error details:', brightDataStatus.error || 'No details available');
					break;
				} else {
					// Still running, wait before next check
					await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds
				}
			} catch (error) {
				console.log(`⚠️  Error checking BrightData status: ${error.message}`);
				await new Promise((resolve) => setTimeout(resolve, 30000));
			}
		}

		if (!isComplete && attempts >= maxAttempts) {
			console.log('\n⏰ Monitoring timeout reached. Collection may still be running.');
			console.log(`Check BrightData status manually: ${BASE_URL}/debug/snapshot-status?snapshot_id=${snapshotId}`);
			console.log(`Check workflow status manually: ${BASE_URL}/zillow/status?instanceId=${instanceId}`);
		}
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		process.exit(1);
	}
}

async function showResults() {
	try {
		console.log('📁 Checking for collected files...');
		const filesResponse = await fetch(`${BASE_URL}/zillow/files?location=81416`);
		const filesData = await filesResponse.json();

		if (filesData.files && filesData.files.length > 0) {
			console.log(`📈 Found ${filesData.files.length} data files:`);

			filesData.files.forEach((file, index) => {
				console.log(`   ${index + 1}. ${file.key}`);
				console.log(`      Size: ${(file.size / 1024).toFixed(1)} KB`);
				console.log(`      Records: ${file.metadata?.recordCount || 'unknown'}`);
				console.log(`      Uploaded: ${new Date(file.uploaded).toLocaleString()}`);
			});

			if (filesData.files.length > 0) {
				const latestFile = filesData.files[filesData.files.length - 1];
				console.log(`\n💾 To download the latest file:`);
				console.log(`   curl "${BASE_URL}/zillow/download?file=${latestFile.key}" -o latest-81416-data.json`);
			}
		} else {
			console.log('📂 No files found yet.');
		}
	} catch (error) {
		console.log(`⚠️  Error checking files: ${error.message}`);
	}
}

// Helper functions
function showUsage() {
	console.log(`
🏠 Zillow 81416 Test Script

Usage:
  node test-81416.js          # Run the full test with monitoring
  node test-81416.js start    # Just start collection (no monitoring)
  node test-81416.js status   # Check status of running collections
  node test-81416.js files    # List collected files

Setup Required:
  1. Make sure your development server is running:
     pnpm start

  2. Set up your BrightData API token:
     - Edit .dev.vars file and replace 'your_brightdata_api_token_here' with your actual token
     - Get your token from: https://brightdata.com/cp/api_tokens
     - Restart wrangler dev after updating .dev.vars

Note: Without a valid BrightData API token, the workflow will fail with an authentication error.
`);
}

// Handle command line arguments
const command = process.argv[2];

if (command === 'start') {
	// Just start collection
	fetch(`${BASE_URL}/zillow/test-81416`, { method: 'POST' })
		.then((r) => r.json())
		.then((result) => {
			console.log('✅ Started collection:', result.id);
			console.log(`Check status: node test-81416.js status ${result.id}`);
		})
		.catch((err) => console.error('❌ Error:', err.message));
} else if (command === 'files') {
	// List files
	fetch(`${BASE_URL}/zillow/files?location=81416`)
		.then((r) => r.json())
		.then(showResults)
		.catch((err) => console.error('❌ Error:', err.message));
} else if (command === 'help' || command === '--help' || command === '-h') {
	showUsage();
} else {
	// Run full test by default
	runTest();
}
