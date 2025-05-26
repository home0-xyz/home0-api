#!/usr/bin/env node

/**
 * Test collection for one ZIP code first
 */

const PRODUCTION_URL = 'https://home0-platform.peteknowsai.workers.dev';

// Get API key from environment or prompt
const API_KEY = process.env.API_KEY || process.env.HOME0_API_KEY;

if (!API_KEY) {
    console.error('❌ API_KEY environment variable is required');
    console.log('Set it with: export API_KEY=your_api_key_here');
    process.exit(1);
}

// Calculate date 90 days ago
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
const fromDate = ninetyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

async function testOneZip() {
    const zipCode = '81415'; // Test with one ZIP first
    
    const payload = {
        location: zipCode,
        filters: {
            status: 'for_sale',
            listing_type: 'for_sale',
            date_from: fromDate,
            sort: 'newest'
        }
    };

    console.log(`🚀 Testing collection for ZIP ${zipCode} (sales since ${fromDate})`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${PRODUCTION_URL}/workflow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ Test workflow started:`);
        console.log(`   Workflow ID: ${result.workflowId}`);
        console.log(`   Status URL: ${PRODUCTION_URL}/workflow/${result.workflowId}`);
        
        // Wait a bit and check status
        console.log('\n⏳ Waiting 5 seconds to check initial status...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const statusResponse = await fetch(`${PRODUCTION_URL}/workflow/${result.workflowId}`);
        if (statusResponse.ok) {
            const status = await statusResponse.json();
            console.log(`📊 Status: ${status.status}`);
            if (status.result) {
                console.log(`📈 Progress: ${JSON.stringify(status.result, null, 2)}`);
            }
        }
        
        return result;
    } catch (error) {
        console.error(`❌ Test failed:`, error.message);
        return null;
    }
}

testOneZip().catch(error => {
    console.error('Test script failed:', error);
    process.exit(1);
});