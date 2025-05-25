import type { Env } from '../shared/types/env';
import {
	handleZillowCollect,
	handleZillowStatus,
	handleZillowFiles,
	handleZillowDownload,
	handleZillowTest81428,
	handleZillowTest81416,
	handleZillowTest81415,
	handleZillowTest81623
} from './handlers/collect';
import {
	handleZillowDetailsCollect,
	handleZillowDetailsStatus,
	handleZillowDetailsAuto,
	handleZillowDetailsStats
} from './handlers/details';

export const zillowRouter = {
	async handle(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace('/zillow', '');

		// Collection endpoints
		if (path === '/collect') {
			return handleZillowCollect(request, env);
		}

		if (path === '/status') {
			return handleZillowStatus(request, env);
		}

		if (path === '/files') {
			return handleZillowFiles(request, env);
		}

		if (path === '/download') {
			return handleZillowDownload(request, env);
		}

		// Test endpoints - consolidate later
		if (path === '/test-81428') {
			return handleZillowTest81428(request, env);
		}

		if (path === '/test-81416') {
			return handleZillowTest81416(request, env);
		}

		if (path === '/test-81415') {
			return handleZillowTest81415(request, env);
		}

		if (path === '/test-81623') {
			return handleZillowTest81623(request, env);
		}

		// Property details endpoints
		if (path === '/details/collect') {
			return handleZillowDetailsCollect(request, env);
		}

		if (path === '/details/status') {
			return handleZillowDetailsStatus(request, env);
		}

		if (path === '/details/auto') {
			return handleZillowDetailsAuto(request, env);
		}

		if (path === '/details/stats') {
			return handleZillowDetailsStats(request, env);
		}

		return new Response('Not found', { status: 404 });
	}
};