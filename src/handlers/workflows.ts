import type { Env } from '../shared/types/env';
import { WorkflowTracker, type WorkflowType } from '../shared/workflow-tracker';

/**
 * Get all workflow runs with optional filtering
 */
export async function handleWorkflowsList(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const url = new URL(req.url);
		const workflowType = url.searchParams.get('type') as WorkflowType | null;
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
		const status = url.searchParams.get('status');

		const tracker = new WorkflowTracker(env);
		let runs = await tracker.getRecentRuns(workflowType || undefined, limit);

		// Filter by status if provided
		if (status) {
			runs = runs.filter(run => run.status === status);
		}

		return Response.json({
			runs,
			total: runs.length,
			filters: {
				type: workflowType,
				status,
				limit
			}
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch workflow runs',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

/**
 * Get specific workflow run by ID
 */
export async function handleWorkflowGet(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const url = new URL(req.url);
		const workflowId = url.searchParams.get('id');

		if (!workflowId) {
			return Response.json({ error: 'Workflow ID is required' }, { status: 400 });
		}

		const tracker = new WorkflowTracker(env);
		const run = await tracker.getRun(workflowId);

		if (!run) {
			return Response.json({ error: 'Workflow run not found' }, { status: 404 });
		}

		// Parse JSON fields for better display
		const parsedRun = {
			...run,
			input_params: run.input_params ? JSON.parse(run.input_params) : null,
			output_summary: run.output_summary ? JSON.parse(run.output_summary) : null,
			brightdata_snapshots: run.brightdata_snapshots ? JSON.parse(run.brightdata_snapshots) : null
		};

		return Response.json({ run: parsedRun });
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch workflow run',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

/**
 * Get workflow statistics
 */
export async function handleWorkflowStats(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const url = new URL(req.url);
		const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 30);

		const tracker = new WorkflowTracker(env);
		const stats = await tracker.getStats(days);
		const activeWorkflows = await tracker.getActiveWorkflows();

		// Group stats by workflow type
		const groupedStats: Record<string, any[]> = {};
		stats.forEach((stat: any) => {
			if (!groupedStats[stat.workflow_type]) {
				groupedStats[stat.workflow_type] = [];
			}
			groupedStats[stat.workflow_type].push(stat);
		});

		// Calculate totals
		const totals = {
			total_runs: stats.reduce((sum: number, stat: any) => sum + stat.count, 0),
			total_processed: stats.reduce((sum: number, stat: any) => sum + (stat.total_processed || 0), 0),
			total_errors: stats.reduce((sum: number, stat: any) => sum + (stat.total_errors || 0), 0),
			avg_duration: stats.length > 0 ? 
				stats.reduce((sum: number, stat: any) => sum + (stat.avg_duration || 0), 0) / stats.length : 0
		};

		return Response.json({
			period_days: days,
			totals,
			by_workflow_type: groupedStats,
			active_count: activeWorkflows.length,
			raw_stats: stats
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch workflow statistics',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

/**
 * Get active workflows
 */
export async function handleActiveWorkflows(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const tracker = new WorkflowTracker(env);
		const activeWorkflows = await tracker.getActiveWorkflows();

		return Response.json({
			active_workflows: activeWorkflows,
			count: activeWorkflows.length
		});
	} catch (error) {
		return Response.json({
			error: 'Failed to fetch active workflows',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}