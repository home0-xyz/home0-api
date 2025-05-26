import type { Env } from '../shared/types/env';
import { DailyPropertyMonitor } from '../cron/daily-monitor';

/**
 * Manual trigger for daily monitoring (for testing)
 */
export async function handleMonitoringTrigger(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const monitor = new DailyPropertyMonitor(env);
        const result = await monitor.runDailyMonitoring();

        return Response.json({
            success: true,
            result
        });
    } catch (error) {
        return Response.json({
            error: 'Monitoring failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * Get monitoring history
 */
export async function handleMonitoringHistory(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const url = new URL(req.url);
        const days = parseInt(url.searchParams.get('days') || '30');

        const runs = await env.DB.prepare(`
            SELECT * FROM monitoring_runs 
            WHERE run_date >= date('now', '-' || ? || ' days')
            ORDER BY run_date DESC
        `).bind(days).all();

        return Response.json({
            runs: runs.results
        });
    } catch (error) {
        return Response.json({
            error: 'Failed to fetch monitoring history',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * Get recent property changes
 */
export async function handlePropertyChanges(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const url = new URL(req.url);
        const days = parseInt(url.searchParams.get('days') || '7');
        const changeType = url.searchParams.get('type');

        let query = `
            SELECT 
                pc.*,
                p.street_address,
                p.city,
                p.zipcode,
                p.url
            FROM property_changes pc
            JOIN properties p ON pc.zpid = p.zpid
            WHERE pc.change_date >= date('now', '-' || ? || ' days')
        `;

        const params: any[] = [days];

        if (changeType) {
            query += ' AND pc.change_type = ?';
            params.push(changeType);
        }

        query += ' ORDER BY pc.change_date DESC, pc.created_at DESC LIMIT 100';

        const changes = await env.DB.prepare(query).bind(...params).all();

        // Group by change type
        const grouped = changes.results.reduce((acc: any, change: any) => {
            if (!acc[change.change_type]) {
                acc[change.change_type] = [];
            }
            acc[change.change_type].push(change);
            return acc;
        }, {});

        return Response.json({
            total: changes.results.length,
            by_type: grouped,
            changes: changes.results
        });
    } catch (error) {
        return Response.json({
            error: 'Failed to fetch property changes',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * Get change summary statistics
 */
export async function handleChangeSummary(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const summary = await env.DB.prepare(`
            SELECT * FROM daily_change_summary
        `).all();

        const stats = await env.DB.prepare(`
            SELECT 
                change_type,
                COUNT(*) as total_changes,
                COUNT(DISTINCT zpid) as unique_properties
            FROM property_changes
            WHERE change_date >= date('now', '-30 days')
            GROUP BY change_type
        `).all();

        return Response.json({
            daily_summary: summary.results,
            monthly_stats: stats.results
        });
    } catch (error) {
        return Response.json({
            error: 'Failed to fetch change summary',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}