export async function insertCollection(db: D1Database, collectionData: {
	id: string;
	location: string;
	listing_category?: string;
	home_type?: string;
	days_on_zillow?: string;
	exact_address?: boolean;
	snapshot_id: string;
}) {
	return await db.prepare(`
		INSERT INTO collections (id, location, listing_category, home_type, days_on_zillow, exact_address, snapshot_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`).bind(
		collectionData.id,
		collectionData.location,
		collectionData.listing_category || null,
		collectionData.home_type || null,
		collectionData.days_on_zillow || null,
		collectionData.exact_address || false,
		collectionData.snapshot_id
	).run();
}

export async function insertProperty(db: D1Database, property: any, collectionId: string) {
	// Ensure ZPID is a string without decimal points
	const zpid = typeof property.zpid === 'number' ?
		Math.floor(property.zpid).toString() :
		String(property.zpid);

	return await db.prepare(`
		INSERT OR REPLACE INTO properties (
			zpid, collection_id, url, street_address, city, state, zipcode,
			price, currency, bedrooms, bathrooms, living_area, lot_size,
			year_built, home_type, home_status, latitude, longitude,
			zestimate, rent_zestimate
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(
		zpid,
		collectionId,
		property.url || null,
		property.address?.street_address || property.street_address || null,
		property.address?.city || property.city || null,
		property.address?.state || property.state || null,
		property.address?.zipcode || property.zipcode || null,
		property.price || null,
		property.currency || 'USD',
		property.bedrooms || null,
		property.bathrooms || null,
		property.living_area || property.living_area_value || null,
		property.lot_size || property.lot_area_value || null,
		property.year_built || null,
		property.home_type || null,
		property.home_status || null,
		property.latitude || null,
		property.longitude || null,
		property.zestimate || null,
		property.rent_zestimate || null
	).run();
}

export async function insertPropertyDetails(db: D1Database, property: any) {
	const resoFacts = property.reso_facts || {};

	// Ensure ZPID is a string without decimal points
	const zpid = typeof property.zpid === 'number' ?
		Math.floor(property.zpid).toString() :
		String(property.zpid);

	return await db.prepare(`
		INSERT OR REPLACE INTO property_details (
			zpid, description, property_tax_rate, monthly_hoa_fee, parcel_id,
			county_fips, county, has_garage, has_cooling, has_heating,
			heating_systems, appliances, flooring, architectural_style,
			basement, fencing, water_source, parking_capacity, roof_type,
			structure_type, zoning, lot_features, exterior_features,
			fireplace_features, laundry_features, other_structures,
			elementary_school, middle_school, high_school, photo_count,
			date_sold, last_sold_price, days_on_zillow, page_view_count,
			favorite_count, tour_view_count, raw_data
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(
		zpid,
		property.description || null,
		property.property_tax_rate || null,
		property.monthly_hoa_fee || null,
		property.parcel_id || resoFacts.parcel_number || null,
		property.county_fips || null,
		property.county || null,
		resoFacts.has_garage || false,
		resoFacts.has_cooling || false,
		resoFacts.has_heating || false,
		JSON.stringify(resoFacts.heating || []),
		JSON.stringify(resoFacts.appliances || []),
		resoFacts.flooring || null,
		resoFacts.architectural_style || null,
		resoFacts.basement || null,
		resoFacts.fencing || null,
		JSON.stringify(resoFacts.water_source || []),
		resoFacts.parking_capacity || null,
		resoFacts.roof_type || null,
		resoFacts.structure_type || null,
		resoFacts.zoning || null,
		JSON.stringify(resoFacts.lot_features || []),
		JSON.stringify(resoFacts.exterior_features || []),
		resoFacts.fireplace_features || null,
		JSON.stringify(resoFacts.laundry_features || []),
		resoFacts.other_structures || null,
		resoFacts.elementary_school || null,
		resoFacts.middle_or_junior_school || null,
		resoFacts.high_school || null,
		property.photo_count || 0,
		property.date_sold || null,
		property.last_sold_price || null,
		property.days_on_zillow || null,
		property.page_view_count || null,
		property.favorite_count || null,
		property.tour_view_count || null,
		JSON.stringify(property)
	).run();
}

export async function insertPropertyPhotos(db: D1Database, zpidParam: string, photos: any[]) {
	if (!photos || photos.length === 0) return;

	// Ensure ZPID is normalized (remove .0 if present)
	const zpid = zpidParam.endsWith('.0') ? zpidParam.slice(0, -2) : zpidParam;

	const statements = photos.map((photo, index) => {
		const jpeg = photo.mixed_sources?.jpeg || [];
		const webp = photo.mixed_sources?.webp || [];

		const getUrlByWidth = (sources: any[], width: string) =>
			sources.find(s => s.width === width)?.url || null;

		return db.prepare(`
			INSERT INTO property_photos (
				zpid, photo_order, url_192, url_384, url_576, url_768,
				url_960, url_1152, url_1344, url_1536,
				webp_192, webp_384, webp_576, webp_768,
				webp_960, webp_1152, webp_1344, webp_1536
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			zpid, index,
			getUrlByWidth(jpeg, '192'), getUrlByWidth(jpeg, '384'),
			getUrlByWidth(jpeg, '576'), getUrlByWidth(jpeg, '768'),
			getUrlByWidth(jpeg, '960'), getUrlByWidth(jpeg, '1152'),
			getUrlByWidth(jpeg, '1344'), getUrlByWidth(jpeg, '1536'),
			getUrlByWidth(webp, '192'), getUrlByWidth(webp, '384'),
			getUrlByWidth(webp, '576'), getUrlByWidth(webp, '768'),
			getUrlByWidth(webp, '960'), getUrlByWidth(webp, '1152'),
			getUrlByWidth(webp, '1344'), getUrlByWidth(webp, '1536')
		);
	});

	return await db.batch(statements);
}

export async function insertPriceHistory(db: D1Database, zpidParam: string, priceHistory: any[]) {
	if (!priceHistory || priceHistory.length === 0) return;

	// Ensure ZPID is normalized (remove .0 if present)
	const zpid = zpidParam.endsWith('.0') ? zpidParam.slice(0, -2) : zpidParam;

	const statements = priceHistory.map(entry =>
		db.prepare(`
			INSERT INTO price_history (
				zpid, date, event, price, price_change_rate,
				price_per_square_foot, source, posting_is_rental
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			zpid, entry.date, entry.event, entry.price || null,
			entry.price_change_rate || null, entry.price_per_square_foot || null,
			entry.source || null, entry.posting_is_rental || false
		)
	);

	return await db.batch(statements);
}

export async function insertTaxHistory(db: D1Database, zpidParam: string, taxHistory: any[]) {
	if (!taxHistory || taxHistory.length === 0) return;

	// Ensure ZPID is normalized (remove .0 if present)
	const zpid = zpidParam.endsWith('.0') ? zpidParam.slice(0, -2) : zpidParam;

	const statements = taxHistory.map(entry => {
		const year = entry.time ? new Date(entry.time).getFullYear() : null;
		return db.prepare(`
			INSERT INTO tax_history (
				zpid, year, tax_paid, tax_increase_rate,
				assessed_value, value_increase_rate
			) VALUES (?, ?, ?, ?, ?, ?)
		`).bind(
			zpid, year, entry.tax_paid || null, entry.tax_increase_rate || null,
			entry.value || null, entry.value_increase_rate || null
		);
	});

	return await db.batch(statements);
}

export async function insertSchools(db: D1Database, zpidParam: string, schools: any[]) {
	if (!schools || schools.length === 0) return;

	// Ensure ZPID is normalized (remove .0 if present)
	const zpid = zpidParam.endsWith('.0') ? zpidParam.slice(0, -2) : zpidParam;

	// Filter out schools without required data and clean the data
	const validSchools = schools
		.filter(school => school && school.name) // Only schools with a name
		.map(school => ({
			zpid,
			name: school.name,
			grades: school.grades || null,
			rating: school.rating || null,
			distance: school.distance || null,
			link: school.link || null
		}));

	if (validSchools.length === 0) return;

	const statements = validSchools.map(school =>
		db.prepare(`
			INSERT INTO schools (zpid, name, grades, rating, distance, link)
			VALUES (?, ?, ?, ?, ?, ?)
		`).bind(
			school.zpid,
			school.name,
			school.grades,
			school.rating,
			school.distance,
			school.link
		)
	);

	return await db.batch(statements);
}
