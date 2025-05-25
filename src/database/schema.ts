import { insertCollection, insertProperty, insertPropertyDetails, insertPropertyPhotos, insertPriceHistory, insertTaxHistory, insertSchools } from './operations';

export async function storePropertiesInDatabase(db: D1Database, properties: any[], collectionId: string) {
	console.log(`Storing ${properties.length} properties in database...`);

	for (const property of properties) {
		try {
			// Normalize ZPID to string without decimal points
			const zpid = typeof property.zpid === 'number' ?
				Math.floor(property.zpid).toString() :
				String(property.zpid);

			// Insert basic property info ONLY
			// The search workflow should not insert detailed data or set has_details flag
			await insertProperty(db, property, collectionId);

			console.log(`✅ Stored property ${zpid}`);
		} catch (error) {
			console.error(`❌ Error storing property ${property.zpid}:`, error);
		}
	}
}

export async function storePropertyDetailsInDatabase(db: D1Database, property: any) {
	console.log(`Storing detailed data for property ${property.zpid}...`);
	
	try {
		// Normalize ZPID to string without decimal points
		const zpid = typeof property.zpid === 'number' ?
			Math.floor(property.zpid).toString() :
			String(property.zpid);

		// Insert all detailed data from the property details API
		await insertPropertyDetails(db, property);

		// Insert photos if available
		if (property.responsive_photos || property.photos) {
			await insertPropertyPhotos(db, zpid, property.responsive_photos || property.photos);
		}

		// Insert price history
		if (property.price_history) {
			await insertPriceHistory(db, zpid, property.price_history);
		}

		// Insert tax history
		if (property.tax_history) {
			await insertTaxHistory(db, zpid, property.tax_history);
		}

		// Insert schools
		if (property.schools) {
			await insertSchools(db, zpid, property.schools);
		}

		// Mark as having details only after all detail data is inserted
		await db.prepare(`
			UPDATE properties SET has_details = TRUE, updated_at = CURRENT_TIMESTAMP
			WHERE zpid = ?
		`).bind(zpid).run();

		console.log(`✅ Stored detailed data for property ${zpid}`);
		return { success: true, zpid };
	} catch (error) {
		console.error(`❌ Error storing property details for ${property.zpid}:`, error);
		return { success: false, zpid: property.zpid, error };
	}
}

export { insertCollection };