// Test workflow tracking system
const WORKER_URL = 'https://home0-platform.peteknowsai.workers.dev';
const API_KEY = 'c2ba6ec636c4a5b52693f2fcf1bf41544081e039bb1e73bccf45eb47733b4581';

async function testWorkflowTracking() {
    console.log('🔍 Testing Workflow Tracking System\n');

    try {
        // 1. Check current workflow stats
        console.log('📊 Current workflow statistics:');
        const statsResponse = await fetch(`${WORKER_URL}/workflows/stats`, {
            headers: { 'X-API-Key': API_KEY }
        });
        const stats = await statsResponse.json();
        console.log(`Total runs: ${stats.totals.total_runs}`);
        console.log(`Total processed: ${stats.totals.total_processed}`);
        console.log(`Total errors: ${stats.totals.total_errors}\n`);

        // 2. Show recent workflow runs
        console.log('📝 Recent workflow runs:');
        const runsResponse = await fetch(`${WORKER_URL}/workflows?limit=5`, {
            headers: { 'X-API-Key': API_KEY }
        });
        const runsData = await runsResponse.json();
        
        runsData.runs.forEach(run => {
            const inputParams = JSON.parse(run.input_params);
            const duration = run.duration_seconds 
                ? `${run.duration_seconds}s` 
                : run.status === 'running' ? 'running...' : 'pending';
            
            console.log(`  ${run.workflow_type} | ${run.status} | ${duration} | ${inputParams.source || 'manual'}`);
        });

        // 3. Show active workflows
        console.log('\n⚡ Active workflows:');
        const activeResponse = await fetch(`${WORKER_URL}/workflows/active`, {
            headers: { 'X-API-Key': API_KEY }
        });
        const activeData = await activeResponse.json();
        
        if (activeData.active_workflows.length === 0) {
            console.log('  No active workflows');
        } else {
            activeData.active_workflows.forEach(workflow => {
                const duration = Math.round(workflow.current_duration_seconds);
                console.log(`  ${workflow.workflow_type} | running ${duration}s | ${workflow.total_processed} processed`);
            });
        }

        console.log('\n✅ Workflow tracking system is working perfectly!');
        console.log('\nAvailable endpoints:');
        console.log('  GET /workflows - List all workflow runs');
        console.log('  GET /workflows/get?id=<id> - Get specific workflow');
        console.log('  GET /workflows/stats - Get workflow statistics');
        console.log('  GET /workflows/active - Get active workflows');

    } catch (error) {
        console.error('❌ Error testing workflow tracking:', error);
    }
}

testWorkflowTracking();