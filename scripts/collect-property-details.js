#!/usr/bin/env node

/**
 * Collect detailed property information for all properties in the database
 */

const API_KEY = process.env.API_KEY || 'c2ba6ec636c4a5b52693f2fcf1bf41544081e039bb1e73bccf45eb47733b4581';
const BASE_URL = 'https://home0-platform.peteknowsai.workers.dev';

async function fetchWithAuth(endpoint, options = {}) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return response.json();
}

async function getPropertiesWithoutDetails() {
    console.log('🔍 Fetching properties without details...');
    
    // Get all properties
    const data = await fetchWithAuth('/database/properties?limit=200');
    
    // Filter properties that don't have details
    const propertiesWithoutDetails = data.properties.filter(p => p.has_details === 0);
    
    console.log(`Found ${propertiesWithoutDetails.length} properties without details`);
    
    // Group by ZIP code for summary
    const byZip = {};
    propertiesWithoutDetails.forEach(p => {
        if (!byZip[p.zipcode]) {
            byZip[p.zipcode] = [];
        }
        byZip[p.zipcode].push(p.zpid);
    });
    
    console.log('\n📍 Properties by ZIP code:');
    Object.entries(byZip).forEach(([zip, zpids]) => {
        console.log(`   ZIP ${zip}: ${zpids.length} properties`);
    });
    
    return propertiesWithoutDetails;
}

async function collectPropertyDetails(properties, batchSize = 10) {
    const zpids = properties.map(p => p.zpid);
    
    console.log(`\n🚀 Starting property details collection for ${zpids.length} properties`);
    console.log(`Batch size: ${batchSize} properties per workflow`);
    
    const workflows = [];
    
    // Process in batches
    for (let i = 0; i < zpids.length; i += batchSize) {
        const batch = zpids.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(zpids.length / batchSize);
        
        console.log(`\n📦 Batch ${batchNumber}/${totalBatches}: ${batch.length} properties`);
        console.log(`   ZPIDs: ${batch.join(', ')}`);
        
        try {
            const payload = {
                zpids: batch,
                source: 'manual',
                batchSize: batch.length
            };
            
            const response = await fetchWithAuth('/zillow/details/collect', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            console.log(`✅ Workflow started:`);
            console.log(`   Workflow ID: ${response.id}`);
            console.log(`   Status URL: ${BASE_URL}/zillow/details/status?instanceId=${response.id}`);
            
            workflows.push({
                workflowId: response.id,
                batch: batch,
                batchNumber
            });
            
            // Small delay between batches
            if (i + batchSize < zpids.length) {
                console.log('   Waiting 2 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            console.error(`❌ Failed to start workflow for batch ${batchNumber}:`, error.message);
        }
    }
    
    return workflows;
}

async function main() {
    console.log('🏠 Property Details Collection Tool');
    console.log('=' .repeat(50));
    
    try {
        // Get properties without details
        const properties = await getPropertiesWithoutDetails();
        
        if (properties.length === 0) {
            console.log('\n✅ All properties already have details collected!');
            return;
        }
        
        // Ask for confirmation
        console.log(`\n⚠️  This will start collection for ${properties.length} properties`);
        console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Collect details
        const workflows = await collectPropertyDetails(properties);
        
        // Summary
        console.log('\n📊 Summary:');
        console.log(`   Total properties: ${properties.length}`);
        console.log(`   Workflows started: ${workflows.length}`);
        console.log(`   Properties per workflow: 10`);
        
        if (workflows.length > 0) {
            console.log('\n🔍 Track progress:');
            workflows.forEach(({ workflowId, batchNumber }) => {
                console.log(`   Batch ${batchNumber}: ${BASE_URL}/zillow/details/status?instanceId=${workflowId}`);
            });
            
            console.log(`\n📈 Monitor all workflows: ${BASE_URL}/workflows`);
            console.log(`📊 Check details stats: ${BASE_URL}/zillow/details/stats`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}