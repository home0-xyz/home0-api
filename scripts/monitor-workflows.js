#!/usr/bin/env node

/**
 * Monitor workflow status from the command line
 */

const API_KEY = process.env.API_KEY || 'c2ba6ec636c4a5b52693f2fcf1bf41544081e039bb1e73bccf45eb47733b4581';
const BASE_URL = 'https://home0-platform.peteknowsai.workers.dev';

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function colorize(text, color) {
    return `${COLORS[color]}${text}${COLORS.reset}`;
}

function getStatusColor(status) {
    switch (status) {
        case 'completed': return 'green';
        case 'running': return 'blue';
        case 'failed': return 'red';
        case 'queued': return 'yellow';
        default: return 'dim';
    }
}

async function fetchWithAuth(endpoint) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 'X-API-Key': API_KEY }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
}

async function displayStats() {
    try {
        const stats = await fetchWithAuth('/workflows/stats');
        
        console.log(colorize('\n📊 Workflow Statistics', 'bright'));
        console.log('─'.repeat(50));
        console.log(`Total Runs:        ${colorize(stats.totals.total_runs, 'cyan')}`);
        console.log(`Total Processed:   ${colorize(stats.totals.total_processed, 'cyan')}`);
        console.log(`Total Errors:      ${colorize(stats.totals.total_errors, stats.totals.total_errors > 0 ? 'red' : 'green')}`);
        console.log(`Active Workflows:  ${colorize(stats.active_count || 0, 'blue')}`);
    } catch (error) {
        console.error(colorize(`❌ Failed to load statistics: ${error.message}`, 'red'));
    }
}

async function displayActiveWorkflows() {
    try {
        const data = await fetchWithAuth('/workflows/active');
        
        console.log(colorize('\n⚡ Active Workflows', 'bright'));
        console.log('─'.repeat(50));
        
        if (!data.active_workflows || data.active_workflows.length === 0) {
            console.log(colorize('No active workflows', 'dim'));
            return;
        }
        
        data.active_workflows.forEach(workflow => {
            try {
                const params = workflow.input_params ? JSON.parse(workflow.input_params) : {};
                const location = params.location || (params.zpids ? `${params.zpids.length} properties` : '-');
                const runningTime = Math.round(workflow.current_duration_seconds / 60);
                
                console.log(`${colorize('●', 'green')} ${workflow.workflow_type.replace('_', ' ')} | ${location} | ${runningTime}m | ${workflow.total_processed || 0} items`);
            } catch (e) {
                // Skip workflows with parsing errors
                console.log(`${colorize('●', 'yellow')} ${workflow.workflow_type.replace('_', ' ')} | parsing error | ${workflow.total_processed || 0} items`);
            }
        });
    } catch (error) {
        console.error(colorize(`❌ Failed to load active workflows: ${error.message}`, 'red'));
    }
}

async function displayRecentWorkflows(limit = 10) {
    try {
        const data = await fetchWithAuth(`/workflows?limit=${limit}`);
        
        console.log(colorize('\n📋 Recent Workflows', 'bright'));
        console.log('─'.repeat(80));
        
        if (data.runs.length === 0) {
            console.log(colorize('No workflows found', 'dim'));
            return;
        }
        
        // Group by ZIP code for data_collector workflows
        const byLocation = {};
        
        data.runs.forEach(run => {
            const params = JSON.parse(run.input_params);
            const location = params.location || params.zpids?.join(', ') || 'unknown';
            const startTime = new Date(run.created_at);
            const duration = run.duration_seconds 
                ? `${Math.round(run.duration_seconds)}s` 
                : run.status === 'running' ? 'running...' : '-';
            
            const statusColor = getStatusColor(run.status);
            const status = colorize(run.status.padEnd(10), statusColor);
            const type = run.workflow_type.replace('_', ' ').padEnd(20);
            
            if (run.workflow_type === 'data_collector') {
                if (!byLocation[location]) {
                    byLocation[location] = [];
                }
                byLocation[location].push({
                    status: run.status,
                    duration,
                    processed: run.items_processed || 0,
                    time: startTime.toLocaleString()
                });
            }
            
            console.log(`${status} | ${type} | ${location.padEnd(10)} | ${duration.padEnd(10)} | ${run.items_processed || 0} items`);
        });
        
        // Show summary by location
        if (Object.keys(byLocation).length > 0) {
            console.log(colorize('\n📍 Summary by Location', 'bright'));
            console.log('─'.repeat(50));
            
            Object.entries(byLocation).forEach(([location, runs]) => {
                const latest = runs[0];
                const statusColor = getStatusColor(latest.status);
                console.log(`${colorize('ZIP ' + location, 'cyan')}: ${colorize(latest.status, statusColor)} | ${latest.processed} properties found`);
            });
        }
    } catch (error) {
        console.error(colorize(`❌ Failed to load workflows: ${error.message}`, 'red'));
    }
}

async function monitor(continuous = false) {
    console.clear();
    console.log(colorize('🏠 Home0 Workflow Monitor', 'bright'));
    console.log(`Updated: ${new Date().toLocaleString()}`);
    
    await displayStats();
    await displayActiveWorkflows();
    await displayRecentWorkflows(20);
    
    if (continuous) {
        console.log(colorize('\n↻ Refreshing every 30 seconds... (Ctrl+C to exit)', 'dim'));
    }
}

// Main execution
const args = process.argv.slice(2);
const continuous = args.includes('--watch') || args.includes('-w');

if (continuous) {
    monitor(true);
    setInterval(() => monitor(true), 30000);
} else {
    monitor(false);
}