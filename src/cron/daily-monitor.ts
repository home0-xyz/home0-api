import type { Env } from '../shared/types/env';

const MONITORED_ZIP_CODES = ['81410', '81413', '81414', '81415', '81416', '81418', '81419', '81420', '81428'];

export interface DailyMonitorResult {
    runId: number;
    date: string;
    totalProperties: number;
    newListings: number;
    priceChanges: number;
    statusChanges: number;
    removedListings: number;
    errors: string[];
}

export class DailyPropertyMonitor {
    constructor(private env: Env) {}

    async runDailyMonitoring(): Promise<DailyMonitorResult> {
        const runDate = new Date().toISOString().split('T')[0];
        console.log(`Starting daily monitoring for ${runDate}`);

        // Create monitoring run record
        const runResult = await this.env.DB.prepare(
            'INSERT INTO monitoring_runs (run_date, zip_codes, status) VALUES (?, ?, ?) RETURNING id'
        ).bind(runDate, JSON.stringify(MONITORED_ZIP_CODES), 'running').first<{ id: number }>();

        if (!runResult) {
            throw new Error('Failed to create monitoring run');
        }

        const runId = runResult.id;
        const result: DailyMonitorResult = {
            runId,
            date: runDate,
            totalProperties: 0,
            newListings: 0,
            priceChanges: 0,
            statusChanges: 0,
            removedListings: 0,
            errors: []
        };

        try {
            // Step 1: Take snapshot of current properties
            await this.takePropertySnapshot(runDate);

            // Step 2: Trigger collections for all ZIP codes
            const collectionIds = await this.triggerCollections(MONITORED_ZIP_CODES);

            // Step 3: Wait for collections to complete (this would be async in production)
            // In production, you'd use webhooks or a separate process
            
            // Step 4: Detect changes
            const changes = await this.detectChanges(runDate, collectionIds);
            
            // Update result
            result.totalProperties = changes.totalProperties;
            result.newListings = changes.newListings;
            result.priceChanges = changes.priceChanges;
            result.statusChanges = changes.statusChanges;
            result.removedListings = changes.removedListings;

            // Update monitoring run
            await this.env.DB.prepare(`
                UPDATE monitoring_runs 
                SET status = ?, 
                    total_properties = ?,
                    new_listings = ?,
                    price_changes = ?,
                    status_changes = ?,
                    removed_listings = ?,
                    completed_at = ?
                WHERE id = ?
            `).bind(
                'completed',
                result.totalProperties,
                result.newListings,
                result.priceChanges,
                result.statusChanges,
                result.removedListings,
                new Date().toISOString(),
                runId
            ).run();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(errorMessage);
            
            await this.env.DB.prepare(
                'UPDATE monitoring_runs SET status = ?, error_message = ? WHERE id = ?'
            ).bind('failed', errorMessage, runId).run();
        }

        return result;
    }

    private async takePropertySnapshot(date: string): Promise<void> {
        // Snapshot current properties for comparison
        // Note: For now, we'll use a placeholder collection_id since we're snapshotting existing data
        await this.env.DB.prepare(`
            INSERT INTO property_snapshots (zpid, collection_id, snapshot_date, price, home_status)
            SELECT 
                p.zpid,
                'snapshot_' || ? as collection_id,
                ? as snapshot_date,
                p.price,
                p.home_status
            FROM properties p
            WHERE p.zipcode IN (${MONITORED_ZIP_CODES.map(() => '?').join(',')})
            AND NOT EXISTS (
                SELECT 1 FROM property_snapshots ps 
                WHERE ps.zpid = p.zpid AND ps.snapshot_date = ?
            )
        `).bind(date, date, ...MONITORED_ZIP_CODES, date).run();
    }

    private async triggerCollections(zipCodes: string[]): Promise<string[]> {
        const collectionIds: string[] = [];

        for (const zipCode of zipCodes) {
            try {
                const instance = await this.env.ZILLOW_DATA_COLLECTOR.create({
                    params: {
                        location: zipCode,
                        listingCategory: 'House for sale'
                    }
                });
                collectionIds.push(instance.id);
                console.log(`Started collection for ZIP ${zipCode}: ${instance.id}`);
            } catch (error) {
                console.error(`Failed to start collection for ZIP ${zipCode}:`, error);
            }
        }

        return collectionIds;
    }

    private async detectChanges(date: string, collectionIds: string[]): Promise<{
        totalProperties: number;
        newListings: number;
        priceChanges: number;
        statusChanges: number;
        removedListings: number;
    }> {
        // Get yesterday's snapshot
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayDate = yesterday.toISOString().split('T')[0];

        // Count total properties
        const totalResult = await this.env.DB.prepare(
            'SELECT COUNT(DISTINCT zpid) as count FROM properties WHERE zipcode IN (' + 
            MONITORED_ZIP_CODES.map(() => '?').join(',') + ')'
        ).bind(...MONITORED_ZIP_CODES).first<{ count: number }>();

        const totalProperties = totalResult?.count || 0;

        // Detect new listings
        const newListingsResult = await this.env.DB.prepare(`
            SELECT p.zpid, p.street_address, p.city, p.price
            FROM properties p
            LEFT JOIN property_snapshots ps ON p.zpid = ps.zpid AND ps.snapshot_date = ?
            WHERE p.zipcode IN (${MONITORED_ZIP_CODES.map(() => '?').join(',')})
            AND ps.zpid IS NULL
        `).bind(yesterdayDate, ...MONITORED_ZIP_CODES).all();

        const newListings = newListingsResult.results.length;

        // Record new listings
        for (const listing of newListingsResult.results) {
            await this.recordChange(listing.zpid, 'new_listing', date, null, listing.price);
        }

        // Detect price changes
        const priceChangesResult = await this.env.DB.prepare(`
            SELECT 
                p.zpid,
                p.price as new_price,
                ps.price as old_price
            FROM properties p
            JOIN property_snapshots ps ON p.zpid = ps.zpid
            WHERE ps.snapshot_date = ?
            AND p.zipcode IN (${MONITORED_ZIP_CODES.map(() => '?').join(',')})
            AND p.price != ps.price
        `).bind(yesterdayDate, ...MONITORED_ZIP_CODES).all();

        const priceChanges = priceChangesResult.results.length;

        // Record price changes
        for (const change of priceChangesResult.results) {
            await this.recordChange(
                change.zpid, 
                'price_change', 
                date, 
                change.old_price, 
                change.new_price
            );
        }

        // TODO: Implement status change detection
        // TODO: Implement removed listing detection

        return {
            totalProperties,
            newListings,
            priceChanges,
            statusChanges: 0, // TODO
            removedListings: 0 // TODO
        };
    }

    private async recordChange(
        zpid: string,
        changeType: string,
        date: string,
        oldValue: any,
        newValue: any
    ): Promise<void> {
        await this.env.DB.prepare(
            'INSERT INTO property_changes (zpid, change_type, change_date, old_value, new_value, collection_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
            zpid,
            changeType,
            date,
            oldValue?.toString() || null,
            newValue?.toString() || null,
            'daily_monitor' // TODO: Use actual collection ID
        ).run();
    }
}