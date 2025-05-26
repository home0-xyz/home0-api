#!/usr/bin/env node

/**
 * Collect properties that have gone for sale in the last 90 days
 * for specified ZIP codes on production
 */

const ZIP_CODES = ['81410', '81413', '81414', '81415', '81416', '81418', '81419', '81420', '81428'];
const PRODUCTION_URL = 'https://home0-platform.peteknowsai.workers.dev';

// Get API key from environment
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

async function triggerWorkflow(zipCode) {
    const payload = {
        location: zipCode,
        listingCategory: 'House for sale',
        // BrightData doesn't support date filtering directly
        // We'll need to filter results after collection
    };

    console.log(`\n🚀 Starting collection for ZIP ${zipCode} (sales since ${fromDate})`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${PRODUCTION_URL}/zillow/collect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`✅ Workflow started for ZIP ${zipCode}:`);
        console.log(`   Workflow ID: ${result.id}`);
        console.log(`   Status URL: ${PRODUCTION_URL}/zillow/status?instanceId=${result.id}`);
        
        return result;
    } catch (error) {
        console.error(`❌ Failed to start workflow for ZIP ${zipCode}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🏠 Starting recent sales collection for ZIP codes:');
    console.log(`   ZIP codes: ${ZIP_CODES.join(', ')}`);
    console.log(`   Date range: ${fromDate} to today`);
    console.log(`   Production URL: ${PRODUCTION_URL}`);

    const workflows = [];

    // Start workflows for each ZIP code
    for (const zipCode of ZIP_CODES) {
        const result = await triggerWorkflow(zipCode);
        if (result) {
            workflows.push({ zipCode, workflowId: result.id });
        }
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n📊 Summary:');
    console.log(`   Started ${workflows.length}/${ZIP_CODES.length} workflows`);
    
    if (workflows.length > 0) {
        console.log('\n🔍 Track progress at:');
        workflows.forEach(({ zipCode, workflowId }) => {
            console.log(`   ZIP ${zipCode}: ${PRODUCTION_URL}/zillow/status?instanceId=${workflowId}`);
        });
        
        console.log(`\n📈 Monitor all workflows: ${PRODUCTION_URL}/workflows`);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
}