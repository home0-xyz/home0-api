#!/usr/bin/env node

/**
 * Setup checker for the workflows starter project
 * Verifies that all required components are working
 */

const BASE_URL = 'http://localhost:8787';
const fs = require('fs');

async function checkSetup() {
	console.log('🔍 Checking Workflows Starter Setup...\n');

	let allGood = true;

	// Check 1: .dev.vars file exists
	console.log('1. Checking .dev.vars file...');
	if (fs.existsSync('.dev.vars')) {
		const devVars = fs.readFileSync('.dev.vars', 'utf8');
		if (devVars.includes('your_brightdata_api_token_here')) {
			console.log('   ⚠️  .dev.vars exists but still has placeholder token');
			console.log('   📝 Edit .dev.vars and add your actual BrightData API token');
			allGood = false;
		} else if (devVars.includes('BRIGHTDATA_API_TOKEN=')) {
			console.log('   ✅ .dev.vars exists with API token configured');
		} else {
			console.log('   ⚠️  .dev.vars exists but no BRIGHTDATA_API_TOKEN found');
			allGood = false;
		}
	} else {
		console.log('   ❌ .dev.vars file not found');
		console.log('   📝 Run the setup first to create .dev.vars');
		allGood = false;
	}

	// Check 2: Wrangler dev server
	console.log('\n2. Checking development server...');
	try {
		const response = await fetch(`${BASE_URL}/`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000),
		});

		if (response.ok) {
			console.log('   ✅ Development server is running and responding');
		} else {
			console.log(`   ⚠️  Server responded with status: ${response.status}`);
			allGood = false;
		}
	} catch (error) {
		console.log('   ❌ Development server not reachable');
		console.log('   📝 Start the server with: pnpm start');
		allGood = false;
	}

	// Check 3: Workflows endpoint
	console.log('\n3. Checking workflows endpoints...');
	try {
		const endpoints = ['/zillow/test-81428', '/zillow/files?location=81428'];

		for (const endpoint of endpoints) {
			const response = await fetch(`${BASE_URL}${endpoint}`, {
				signal: AbortSignal.timeout(5000),
			});
			console.log(`   ${response.ok ? '✅' : '⚠️ '} ${endpoint} - Status: ${response.status}`);
		}
	} catch (error) {
		console.log('   ❌ Error checking endpoints:', error.message);
		allGood = false;
	}

	// Check 4: Test a workflow (without BrightData)
	console.log('\n4. Testing basic workflow functionality...');
	try {
		const response = await fetch(`${BASE_URL}/`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000),
		});
		const data = await response.json();

		if (data.id && data.details) {
			console.log('   ✅ Basic workflow creation works');
			console.log(`   📋 Test instance ID: ${data.id}`);
		} else {
			console.log('   ⚠️  Unexpected workflow response format');
			allGood = false;
		}
	} catch (error) {
		console.log('   ❌ Workflow test failed:', error.message);
		allGood = false;
	}

	// Check 5: Test R2 bucket functionality
	console.log('\n5. Testing R2 bucket functionality...');
	try {
		const response = await fetch(`${BASE_URL}/r2/test`, {
			method: 'POST',
			signal: AbortSignal.timeout(10000), // R2 operations might take a bit longer
		});
		const data = await response.json();

		if (data.success) {
			console.log('   ✅ R2 bucket read/write/list operations work');
			console.log(`   📁 Test file created: ${data.results.testFile}`);
		} else {
			console.log('   ❌ R2 bucket test failed:', data.error);
			console.log('   💡 Troubleshooting:', data.troubleshooting?.join(', '));
			allGood = false;
		}
	} catch (error) {
		console.log('   ❌ R2 bucket test failed:', error.message);
		console.log('   💡 Make sure wrangler dev is running with R2 bindings');
		allGood = false;
	}

	// Summary
	console.log('\n' + '='.repeat(50));
	if (allGood) {
		console.log('🎉 Setup looks good! Ready to test Zillow data collection.');
		console.log('\nNext steps:');
		console.log('   node test-81428.js start    # Start a test collection');
		console.log('   node test-81428.js files    # Check for collected files');
	} else {
		console.log('⚠️  Setup issues detected. Please fix the items above.');
		console.log('\nSetup help:');
		console.log('   node test-81428.js help     # View setup instructions');
	}
	console.log('');
}

// Run the check
checkSetup().catch((error) => {
	console.error('❌ Setup check failed:', error.message);
	process.exit(1);
});
