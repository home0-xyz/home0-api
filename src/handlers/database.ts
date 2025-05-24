import type { Env } from '../types/env';

export async function handleDatabaseCollections(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const { results } = await env.DB.prepare(`
			SELECT id, location, listing_category, status, record_count, created_at, completed_at
			FROM collections
			ORDER BY created_at DESC
			LIMIT 50
		`).all();

		return Response.json({
			collections: results
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch collections',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleDatabaseProperties(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	const url = new URL(req.url);
	const collectionId = url.searchParams.get('collection_id');
	const location = url.searchParams.get('location');
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const minPrice = url.searchParams.get('min_price');
	const maxPrice = url.searchParams.get('max_price');
	const hasDetails = url.searchParams.get('hasDetails');

	try {
		let query = `
			SELECT p.*, pd.description, pd.photo_count, pd.has_garage, pd.architectural_style
			FROM properties p
			LEFT JOIN property_details pd ON p.zpid = pd.zpid
			WHERE 1=1
		`;
		const params: any[] = [];

		if (collectionId) {
			query += ` AND p.collection_id = ?`;
			params.push(collectionId);
		}
		if (location) {
			query += ` AND (p.city LIKE ? OR p.zipcode = ?)`;
			params.push(`%${location}%`, location);
		}
		if (minPrice) {
			query += ` AND p.price >= ?`;
			params.push(parseInt(minPrice));
		}
		if (maxPrice) {
			query += ` AND p.price <= ?`;
			params.push(parseInt(maxPrice));
		}
		if (hasDetails !== null) {
			if (hasDetails === 'true') {
				query += ` AND p.has_details = TRUE`;
			} else if (hasDetails === 'false') {
				query += ` AND (p.has_details = FALSE OR p.has_details IS NULL)`;
			}
		}

		query += ` ORDER BY p.created_at DESC LIMIT ?`;
		params.push(limit);

		const { results } = await env.DB.prepare(query).bind(...params).all();

		return Response.json({
			properties: results,
			count: results.length
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch properties',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

export async function handleDatabasePropertyDetails(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	const url = new URL(req.url);
	const zpidParam = url.searchParams.get('zpid');

	if (!zpidParam) {
		return Response.json({ error: 'zpid parameter required' }, { status: 400 });
	}

	// Normalize ZPID (remove .0 if present)
	const zpid = zpidParam.endsWith('.0') ? zpidParam.slice(0, -2) : zpidParam;

	try {
		// Get property with details
		const property = await env.DB.prepare(`
			SELECT p.*, pd.*
			FROM properties p
			LEFT JOIN property_details pd ON p.zpid = pd.zpid
			WHERE p.zpid = ?
		`).bind(zpid).first();

		if (!property) {
			return Response.json({ error: 'Property not found' }, { status: 404 });
		}

		// Get photos
		const { results: photos } = await env.DB.prepare(`
			SELECT * FROM property_photos WHERE zpid = ? ORDER BY photo_order
		`).bind(zpid).all();

		// Get price history
		const { results: priceHistory } = await env.DB.prepare(`
			SELECT * FROM price_history WHERE zpid = ? ORDER BY date DESC
		`).bind(zpid).all();

		// Get tax history
		const { results: taxHistory } = await env.DB.prepare(`
			SELECT * FROM tax_history WHERE zpid = ? ORDER BY year DESC
		`).bind(zpid).all();

		// Get schools
		const { results: schools } = await env.DB.prepare(`
			SELECT * FROM schools WHERE zpid = ?
		`).bind(zpid).all();

		return Response.json({
			property,
			photos,
			priceHistory,
			taxHistory,
			schools
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch property details',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}
