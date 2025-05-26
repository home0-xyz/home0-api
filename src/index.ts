import type { Env } from './shared/types/env';
import { DataCollector as ZillowDataCollector } from './zillow/workflows/data-collector';
import { PropertyDetails as ZillowPropertyDetails } from './zillow/workflows/property-details';
import { zillowRouter } from './zillow/router';
import { databaseRouter } from './database/router';
import {
	handleR2Test,
	handleR2Cleanup
} from './handlers/r2';
import {
	handleDebugEnv,
	handleDebugBrightData,
	handleDebugSnapshotStatus,
	handleDebugDownloadReadyData
} from './handlers/debug';
import {
	handleWorkflowsList,
	handleWorkflowGet,
	handleWorkflowStats,
	handleActiveWorkflows
} from './handlers/workflows';
import {
	handleMonitoringTrigger,
	handleMonitoringHistory,
	handlePropertyChanges,
	handleChangeSummary
} from './handlers/monitoring';
import { requireApiKey, shouldRequireApiKey } from './shared/auth';
import scheduledHandler from './scheduled';

// Export workflow classes - keep old names for compatibility
export { ZillowDataCollector, ZillowPropertyDetails };

// Main fetch handler
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		// Favicon - return 404
		if (url.pathname.startsWith('/favicon')) {
			return Response.json({}, { status: 404 });
		}

		// Check API key for protected endpoints
		if (shouldRequireApiKey(url.pathname)) {
			const authError = requireApiKey(req, env);
			if (authError) {
				return authError;
			}
		}

		// Route to feature-specific routers
		if (url.pathname.startsWith('/zillow')) {
			return zillowRouter.handle(req, env);
		}

		if (url.pathname.startsWith('/database')) {
			return databaseRouter.handle(req, env);
		}

		// R2 bucket endpoints
		if (url.pathname === '/r2/test') {
			return handleR2Test(req, env);
		}

		if (url.pathname === '/r2/cleanup') {
			return handleR2Cleanup(req, env);
		}

		// Debug endpoints
		if (url.pathname === '/debug/env') {
			return handleDebugEnv(req, env);
		}

		if (url.pathname === '/debug/brightdata') {
			return handleDebugBrightData(req, env);
		}

		if (url.pathname === '/debug/snapshot-status') {
			return handleDebugSnapshotStatus(req, env);
		}

		if (url.pathname === '/debug/download-ready-data') {
			return handleDebugDownloadReadyData(req, env);
		}

		// Workflow tracking endpoints
		if (url.pathname === '/workflows') {
			return handleWorkflowsList(req, env);
		}

		if (url.pathname === '/workflows/get') {
			return handleWorkflowGet(req, env);
		}

		if (url.pathname === '/workflows/stats') {
			return handleWorkflowStats(req, env);
		}

		if (url.pathname === '/workflows/active') {
			return handleActiveWorkflows(req, env);
		}

		// Monitoring endpoints
		if (url.pathname === '/monitoring/trigger') {
			return handleMonitoringTrigger(req, env);
		}

		if (url.pathname === '/monitoring/history') {
			return handleMonitoringHistory(req, env);
		}

		if (url.pathname === '/monitoring/changes') {
			return handlePropertyChanges(req, env);
		}

		if (url.pathname === '/monitoring/summary') {
			return handleChangeSummary(req, env);
		}

		// Root endpoint
		if (url.pathname === '/') {
			return new Response('Home0 Platform API', {
				headers: { 'Content-Type': 'text/plain' }
			});
		}

		// 404 for unknown routes
		return new Response('Not found', { status: 404 });
	},
	
	// Scheduled handler for cron jobs
	scheduled: scheduledHandler.scheduled
};
