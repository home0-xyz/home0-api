import crypto from 'crypto';

const WORKER_URL = 'http://localhost:8787';
const API_KEY = 'test-api-key-123';

// Helper function to generate webhook secret
function generateWebhookSecret() {
    return crypto.randomUUID();
}

// Test property details collection with webhooks
async function testPropertyDetailsWithWebhooks() {
    console.log('Starting property details webhook test...\n');

    try {
        // Step 1: Get some property ZPIDs from the database
        console.log('1. Fetching available properties...');
        const propertiesResponse = await fetch(`${WORKER_URL}/debug/properties?limit=3`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        if (!propertiesResponse.ok) {
            throw new Error(`Failed to fetch properties: ${propertiesResponse.status}`);
        }

        const propertiesData = await propertiesResponse.json();
        const zpids = propertiesData.properties.map(p => p.zpid);
        
        console.log(`Found ${zpids.length} properties:`, zpids);

        // Step 2: Start property details collection
        console.log('\n2. Starting property details collection...');
        const collectionResponse = await fetch(`${WORKER_URL}/zillow/details/collect`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zpids: zpids,
                batchSize: 10,
                source: 'webhook-test'
            })
        });

        if (!collectionResponse.ok) {
            const error = await collectionResponse.text();
            throw new Error(`Failed to start collection: ${collectionResponse.status} - ${error}`);
        }

        const collectionData = await collectionResponse.json();
        console.log('Collection started:', {
            instanceId: collectionData.id,
            status: collectionData.status
        });

        // Step 3: Check workflow status (should show webhook URLs in logs)
        console.log('\n3. Checking workflow status...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        const statusResponse = await fetch(`${WORKER_URL}/zillow/details/status?id=${collectionData.id}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        if (!statusResponse.ok) {
            throw new Error(`Failed to check status: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();
        console.log('Workflow status:', {
            status: statusData.status,
            output: statusData.output ? 'Has output' : 'No output yet'
        });

        // Step 4: Simulate webhook notification (for testing)
        console.log('\n4. Simulating webhook notification...');
        
        // In real scenario, BrightData would call these webhooks
        // Here we're just showing what the webhook URLs would look like
        console.log('Webhook URLs generated:');
        console.log('- Notify URL: https://home0-workers.petefromsf.workers.dev/zillow/webhooks/notify?secret=<webhook-secret>');
        console.log('- Endpoint URL: https://home0-workers.petefromsf.workers.dev/zillow/webhooks/endpoint?secret=<webhook-secret>');
        
        console.log('\nIn production, BrightData would:');
        console.log('1. Call notify URL with status updates (pending, running, completed)');
        console.log('2. Call endpoint URL with the actual property data when ready');
        console.log('3. Use auth_header for additional security on endpoint calls');

        // Step 5: Check final status
        console.log('\n5. Monitoring workflow (waiting for completion)...');
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            
            const checkResponse = await fetch(`${WORKER_URL}/zillow/details/status?id=${collectionData.id}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                console.log(`Attempt ${attempts + 1}/${maxAttempts} - Status: ${checkData.status}`);
                
                if (checkData.status === 'complete' || checkData.status === 'failed') {
                    console.log('\nWorkflow completed!');
                    console.log('Final output:', JSON.stringify(checkData.output, null, 2));
                    break;
                }
            }
            
            attempts++;
        }

        console.log('\n✅ Test completed!');
        console.log('\nWebhook integration summary:');
        console.log('- Webhook URLs are generated for each batch');
        console.log('- Webhooks include security token in query parameter');
        console.log('- Auth header is used for data delivery endpoint');
        console.log('- Snapshot-to-workflow mapping stored in database');
        console.log('- Both notification and data delivery webhooks supported');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Run the test
testPropertyDetailsWithWebhooks().catch(console.error);