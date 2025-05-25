#!/usr/bin/env node

/**
 * Workflow monitoring script with heartbeat
 * Continuously monitors a workflow and displays progress
 */

const BASE_URL = 'http://localhost:8787';

class WorkflowMonitor {
	constructor(instanceId, options = {}) {
		this.instanceId = instanceId;
		this.interval = options.interval || 5000; // Default 5 seconds
		this.maxDuration = options.maxDuration || 600000; // Default 10 minutes
		this.startTime = Date.now();
		this.checkCount = 0;
		this.lastStatus = null;
		this.spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
		this.spinnerIndex = 0;
	}

	async checkStatus() {
		try {
			const response = await fetch(`${BASE_URL}/zillow/status?instanceId=${this.instanceId}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return await response.json();
		} catch (error) {
			return { error: error.message };
		}
	}

	formatDuration(ms) {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
	}

	clearLine() {
		process.stdout.write('\r\x1b[K');
	}

	updateSpinner() {
		this.spinnerIndex = (this.spinnerIndex + 1) % this.spinner.length;
		return this.spinner[this.spinnerIndex];
	}

	async monitor() {
		console.log(`\n🔍 Monitoring workflow: ${this.instanceId}`);
		console.log(`⏱️  Heartbeat interval: ${this.interval / 1000}s\n`);

		const monitorInterval = setInterval(async () => {
			this.checkCount++;
			const elapsed = Date.now() - this.startTime;

			// Check if max duration exceeded
			if (elapsed > this.maxDuration) {
				clearInterval(monitorInterval);
				console.log('\n⏰ Maximum monitoring duration reached');
				process.exit(0);
			}

			const result = await this.checkStatus();
			
			if (result.error) {
				this.clearLine();
				process.stdout.write(`❌ Error: ${result.error}`);
				return;
			}

			const status = result.status;
			const currentStatus = status.status;
			
			// Update heartbeat display
			this.clearLine();
			const spinner = this.updateSpinner();
			const duration = this.formatDuration(elapsed);
			const heartbeat = `${spinner} Status: ${currentStatus} | Duration: ${duration} | Checks: ${this.checkCount}`;
			
			// Add additional info if available
			if (status.__LOCAL_DEV_STEP_OUTPUTS && status.__LOCAL_DEV_STEP_OUTPUTS.length > 0) {
				const lastOutput = status.__LOCAL_DEV_STEP_OUTPUTS[status.__LOCAL_DEV_STEP_OUTPUTS.length - 1];
				if (lastOutput.snapshot_id) {
					process.stdout.write(`${heartbeat} | Snapshot: ${lastOutput.snapshot_id}`);
				} else {
					process.stdout.write(heartbeat);
				}
			} else {
				process.stdout.write(heartbeat);
			}

			// Check for status changes
			if (this.lastStatus !== currentStatus) {
				console.log(`\n📊 Status changed: ${this.lastStatus || 'initial'} → ${currentStatus}`);
				this.lastStatus = currentStatus;
			}

			// Handle completion
			if (currentStatus === 'complete' || status.output) {
				clearInterval(monitorInterval);
				console.log('\n\n✅ Workflow completed successfully!\n');
				
				if (status.output) {
					console.log('📈 Results:');
					console.log(JSON.stringify(status.output, null, 2));
				}
				
				await this.showPostCompletionOptions();
				process.exit(0);
			}

			// Handle errors
			if (currentStatus === 'errored' || currentStatus === 'terminated') {
				clearInterval(monitorInterval);
				console.log('\n\n❌ Workflow failed!\n');
				
				if (status.error) {
					console.log('Error details:', status.error);
				}
				
				process.exit(1);
			}
		}, this.interval);

		// Handle Ctrl+C gracefully
		process.on('SIGINT', () => {
			clearInterval(monitorInterval);
			console.log('\n\n🛑 Monitoring stopped by user');
			console.log(`📊 Final status: ${this.lastStatus || 'unknown'}`);
			console.log(`⏱️  Total duration: ${this.formatDuration(Date.now() - this.startTime)}`);
			process.exit(0);
		});
	}

	async showPostCompletionOptions() {
		console.log('\n📋 Next steps:');
		console.log(`1. Check files: curl "${BASE_URL}/zillow/files?location=81428"`);
		console.log(`2. Query database: curl "${BASE_URL}/database/properties?addressZipcode=81428"`);
		console.log(`3. Get workflow details: curl "${BASE_URL}/zillow/status?instanceId=${this.instanceId}"`);
	}
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
	console.log(`
📊 Workflow Monitor with Heartbeat

Usage:
  node monitor-workflow.js <INSTANCE_ID> [OPTIONS]

Options:
  --interval <ms>     Heartbeat interval in milliseconds (default: 5000)
  --max <ms>          Maximum monitoring duration in milliseconds (default: 600000)

Examples:
  node monitor-workflow.js fc2e6db5-dc5b-4f1d-b0a2-69890c6209e6
  node monitor-workflow.js fc2e6db5-dc5b-4f1d-b0a2-69890c6209e6 --interval 2000
  node monitor-workflow.js fc2e6db5-dc5b-4f1d-b0a2-69890c6209e6 --interval 10000 --max 1800000

Press Ctrl+C to stop monitoring at any time.
`);
	process.exit(0);
}

const instanceId = args[0];
const options = {};

// Parse options
for (let i = 1; i < args.length; i += 2) {
	if (args[i] === '--interval' && args[i + 1]) {
		options.interval = parseInt(args[i + 1]);
	} else if (args[i] === '--max' && args[i + 1]) {
		options.maxDuration = parseInt(args[i + 1]);
	}
}

// Start monitoring
const monitor = new WorkflowMonitor(instanceId, options);
monitor.monitor();