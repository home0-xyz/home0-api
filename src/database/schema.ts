import { insertCollection, insertProperty, insertPropertyDetails, insertPropertyPhotos, insertPriceHistory, insertTaxHistory, insertSchools } from './operations';

export async function storePropertiesInDatabase(db: D1Database, properties: any[], collectionId: string) {
	console.log(`Storing ${properties.length} properties in database...`);

	for (const property of properties) {
		try {
			// Insert basic property info
			await insertProperty(db, property, collectionId);

			// If this is detailed data (has reso_facts), insert additional details
			if (property.reso_facts || property.description || property.responsive_photos) {
				await insertPropertyDetails(db, property);

				// Insert photos
				if (property.responsive_photos) {
					await insertPropertyPhotos(db, property.zpid, property.responsive_photos);
				}

				// Insert price history
				if (property.price_history) {
					await insertPriceHistory(db, property.zpid, property.price_history);
				}

				// Insert tax history
				if (property.tax_history) {
					await insertTaxHistory(db, property.zpid, property.tax_history);
				}

				// Insert schools
				if (property.schools) {
					await insertSchools(db, property.zpid, property.schools);
				}

				// Mark as having details
				await db.prepare(`
					UPDATE properties SET has_details = TRUE, updated_at = CURRENT_TIMESTAMP
					WHERE zpid = ?
				`).bind(property.zpid).run();
			}

			console.log(`✅ Stored property ${property.zpid}`);
		} catch (error) {
			console.error(`❌ Error storing property ${property.zpid}:`, error);
		}
	}
}

export { insertCollection };
