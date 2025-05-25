/**
 * Direct test of BrightData API to debug status check issues
 */

// You'll need to add your actual token here
const BRIGHTDATA_TOKEN = process.env.BRIGHTDATA_API_TOKEN || 'b7380d9ae932c6e63036b663b7ce1899cfff2eb38347e478e33de6b389fa9c24';
const DATASET_ID = 'gd_m794g571225l6vm7gh';

async function testBrightDataDirectly() {
	console.log('🔍 Testing BrightData API directly...\n');

	try {
		// Test 1: Submit a request
		console.log('📤 Step 1: Submitting BrightData request...');
		const testUrl = 'https://www.zillow.com/homedetails/LOT-2-O-Rd-Paonia-CO-81428/452167218_zpid/';

		const triggerResponse = await fetch(`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET_ID}&include_errors=true`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${BRIGHTDATA_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify([{ url: testUrl }]),
		});

		console.log('Response status:', triggerResponse.status);
		console.log('Response headers:', Object.fromEntries(triggerResponse.headers.entries()));

		if (!triggerResponse.ok) {
			const errorText = await triggerResponse.text();
			console.log('❌ Error response:', errorText);
			return;
		}

		const triggerResult = await triggerResponse.json();
		console.log('✅ Request submitted successfully!');
		console.log('Snapshot ID:', triggerResult.snapshot_id);

		// Test 2: Check status immediately
		console.log('\n🔍 Step 2: Checking status immediately...');
		const statusResponse = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${triggerResult.snapshot_id}`, {
			headers: {
				Authorization: `Bearer ${BRIGHTDATA_TOKEN}`,
			},
		});

		console.log('Status response status:', statusResponse.status);
		const statusText = await statusResponse.text();
		console.log('Status response length:', statusText.length);
		console.log('Raw status response:', statusText.substring(0, 500) + (statusText.length > 500 ? '...' : ''));

		// Try to parse the response
		try {
			const statusData = JSON.parse(statusText);
			console.log('Parsed status data:', statusData);
		} catch (parseError) {
			console.log('Failed to parse as JSON, trying line-by-line...');
			const lines = statusText.trim().split('\n');
			console.log('Number of lines:', lines.length);
			lines.forEach((line, index) => {
				try {
					const parsed = JSON.parse(line);
					console.log(`Line ${index + 1}:`, parsed);
				} catch {
					console.log(`Line ${index + 1} (unparseable):`, line.substring(0, 100));
				}
			});
		}

		// Test 3: Check the specific snapshot mentioned by user
		console.log('\n🔍 Step 3: Checking the snapshot mentioned by user...');
		const userSnapshotId = 's_mb2kexx42hoyjrsaby';
		const userStatusResponse = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${userSnapshotId}`, {
			headers: {
				Authorization: `Bearer ${BRIGHTDATA_TOKEN}`,
			},
		});

		console.log('User snapshot status:', userStatusResponse.status);
		if (userStatusResponse.ok) {
			const userStatusText = await userStatusResponse.text();
			console.log('User snapshot response length:', userStatusText.length);
			console.log('User snapshot response:', userStatusText.substring(0, 200));
		} else {
			console.log('User snapshot error:', await userStatusResponse.text());
		}
	} catch (error) {
		console.error('❌ Error:', error);
	}
}

testBrightDataDirectly();
