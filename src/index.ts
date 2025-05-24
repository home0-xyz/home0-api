import type { Env } from './types/env';
import { MyWorkflow } from './workflows/my-workflow';
import { ZillowDataCollector } from './workflows/zillow-data-collector';
import { ZillowPropertyDetails } from './workflows/zillow-property-details';
import {
	handleZillowCollect,
	handleZillowStatus,
	handleZillowFiles,
	handleZillowDownload,
	handleZillowTest81428,
	handleZillowTest81416
} from './handlers/zillow';
import {
	handleZillowDetailsCollect,
	handleZillowDetailsStatus,
	handleZillowDetailsAuto,
	handleZillowDetailsStats
} from './handlers/zillow-details';
import {
	handleDatabaseCollections,
	handleDatabaseProperties,
	handleDatabasePropertyDetails
} from './handlers/database';
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

// Export workflow classes
export { MyWorkflow, ZillowDataCollector, ZillowPropertyDetails };

// Main fetch handler
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		// Favicon - return 404
		if (url.pathname.startsWith('/favicon')) {
			return Response.json({}, { status: 404 });
		}

		// Zillow data collection endpoints
		if (url.pathname === '/zillow/collect') {
			return handleZillowCollect(req, env);
		}

		if (url.pathname === '/zillow/status') {
			return handleZillowStatus(req, env);
		}

		if (url.pathname === '/zillow/files') {
			return handleZillowFiles(req, env);
		}

		if (url.pathname === '/zillow/download') {
			return handleZillowDownload(req, env);
		}

		if (url.pathname === '/zillow/test-81428') {
			return handleZillowTest81428(req, env);
		}

		if (url.pathname === '/zillow/test-81416') {
			return handleZillowTest81416(req, env);
		}

		// Zillow property details endpoints
		if (url.pathname === '/zillow/details/collect') {
			return handleZillowDetailsCollect(req, env);
		}

		if (url.pathname === '/zillow/details/status') {
			return handleZillowDetailsStatus(req, env);
		}

		if (url.pathname === '/zillow/details/auto') {
			return handleZillowDetailsAuto(req, env);
		}

		if (url.pathname === '/zillow/details/stats') {
			return handleZillowDetailsStats(req, env);
		}

		// Database query endpoints
		if (url.pathname === '/database/collections') {
			return handleDatabaseCollections(req, env);
		}

		if (url.pathname === '/database/properties') {
			return handleDatabaseProperties(req, env);
		}

		if (url.pathname === '/database/property-details') {
			return handleDatabasePropertyDetails(req, env);
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

		// Original workflow endpoints
		// Get the status of an existing instance, if provided
		// GET /?instanceId=<id here>
		const instanceId = url.searchParams.get('instanceId');
		if (instanceId) {
			try {
				const instance = await env.MY_WORKFLOW.get(instanceId);
				return Response.json({
					status: await instance.status(),
				});
			} catch (error) {
				return Response.json({ error: 'Instance not found' }, { status: 404 });
			}
		}

		// Spawn a new instance and return the ID and status
		const instance = await env.MY_WORKFLOW.create();
		return Response.json({
			id: instance.id,
			details: await instance.status(),
		});
	},
};
