import type { Env } from '../shared/types/env';
import {
	handleDatabaseCollections,
	handleDatabaseProperties,
	handleDatabasePropertyDetails
} from '../handlers/database';

export const databaseRouter = {
	async handle(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace('/database', '');

		if (path === '/collections') {
			return handleDatabaseCollections(request, env);
		}

		if (path === '/properties') {
			return handleDatabaseProperties(request, env);
		}

		if (path === '/property-details') {
			return handleDatabasePropertyDetails(request, env);
		}

		return new Response('Not found', { status: 404 });
	}
};