import type { Env } from './types/env';

export type WorkflowType = 'data_collector' | 'property_details';
export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowRunRecord {
	id: string;
	workflow_type: WorkflowType;
	status: WorkflowStatus;
	input_params: string; // JSON string
	created_at: string;
	started_at?: string;
	completed_at?: string;
	duration_seconds?: number;
	total_requested: number;
	total_processed: number;
	total_errors: number;
	total_skipped: number;
	output_summary?: string; // JSON string
	error_message?: string;
	r2_files_created: number;
	r2_total_size_bytes: number;
	brightdata_snapshots?: string; // JSON array
	webhook_used: boolean;
	triggered_by?: string;
	collection_id?: string;
	environment: string;
	worker_version?: string;
	updated_at: string;
}

export interface WorkflowMetrics {
	totalRequested: number;
	totalProcessed: number;
	totalErrors: number;
	totalSkipped: number;
	r2FilesCreated: number;
	r2TotalSizeBytes: number;
	brightdataSnapshots: string[];
	webhookUsed: boolean;
}

export class WorkflowTracker {
	constructor(private env: Env) {}

	/**
	 * Create a new workflow run record
	 */
	async createRun(
		workflowId: string,
		workflowType: WorkflowType,
		inputParams: any,
		triggeredBy?: string
	): Promise<void> {
		const sql = `
			INSERT INTO workflow_runs (
				id, workflow_type, status, input_params, triggered_by, environment, worker_version
			) VALUES (?, ?, 'queued', ?, ?, ?, ?)
		`;

		await this.env.DB.prepare(sql).bind(
			workflowId,
			workflowType,
			JSON.stringify(inputParams),
			triggeredBy || 'api',
			this.env.ENVIRONMENT || 'production',
			'1.0.0' // Could be injected from build process
		).run();
	}

	/**
	 * Update workflow status
	 */
	async updateStatus(
		workflowId: string,
		status: WorkflowStatus,
		errorMessage?: string
	): Promise<void> {
		const now = new Date().toISOString();
		let sql = '';
		let params: any[] = [];

		if (status === 'running') {
			sql = `
				UPDATE workflow_runs 
				SET status = ?, started_at = ?, updated_at = ?
				WHERE id = ?
			`;
			params = [status, now, now, workflowId];
		} else if (status === 'completed' || status === 'failed') {
			sql = `
				UPDATE workflow_runs 
				SET status = ?, completed_at = ?, 
				    duration_seconds = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER),
				    error_message = ?, updated_at = ?
				WHERE id = ?
			`;
			params = [status, now, now, errorMessage, now, workflowId];
		} else {
			sql = `
				UPDATE workflow_runs 
				SET status = ?, error_message = ?, updated_at = ?
				WHERE id = ?
			`;
			params = [status, errorMessage, now, workflowId];
		}

		await this.env.DB.prepare(sql).bind(...params).run();
	}

	/**
	 * Update workflow metrics
	 */
	async updateMetrics(
		workflowId: string,
		metrics: Partial<WorkflowMetrics>
	): Promise<void> {
		const updates: string[] = [];
		const params: any[] = [];

		if (metrics.totalRequested !== undefined) {
			updates.push('total_requested = ?');
			params.push(metrics.totalRequested);
		}
		if (metrics.totalProcessed !== undefined) {
			updates.push('total_processed = ?');
			params.push(metrics.totalProcessed);
		}
		if (metrics.totalErrors !== undefined) {
			updates.push('total_errors = ?');
			params.push(metrics.totalErrors);
		}
		if (metrics.totalSkipped !== undefined) {
			updates.push('total_skipped = ?');
			params.push(metrics.totalSkipped);
		}
		if (metrics.r2FilesCreated !== undefined) {
			updates.push('r2_files_created = ?');
			params.push(metrics.r2FilesCreated);
		}
		if (metrics.r2TotalSizeBytes !== undefined) {
			updates.push('r2_total_size_bytes = ?');
			params.push(metrics.r2TotalSizeBytes);
		}
		if (metrics.brightdataSnapshots !== undefined) {
			updates.push('brightdata_snapshots = ?');
			params.push(JSON.stringify(metrics.brightdataSnapshots));
		}
		if (metrics.webhookUsed !== undefined) {
			updates.push('webhook_used = ?');
			params.push(metrics.webhookUsed);
		}

		if (updates.length > 0) {
			updates.push('updated_at = ?');
			params.push(new Date().toISOString());
			params.push(workflowId);

			const sql = `UPDATE workflow_runs SET ${updates.join(', ')} WHERE id = ?`;
			await this.env.DB.prepare(sql).bind(...params).run();
		}
	}

	/**
	 * Link workflow to a collection
	 */
	async linkToCollection(workflowId: string, collectionId: string): Promise<void> {
		const sql = `
			UPDATE workflow_runs 
			SET collection_id = ?, updated_at = ?
			WHERE id = ?
		`;
		await this.env.DB.prepare(sql).bind(
			collectionId,
			new Date().toISOString(),
			workflowId
		).run();
	}

	/**
	 * Set output summary
	 */
	async setOutputSummary(workflowId: string, summary: any): Promise<void> {
		const sql = `
			UPDATE workflow_runs 
			SET output_summary = ?, updated_at = ?
			WHERE id = ?
		`;
		await this.env.DB.prepare(sql).bind(
			JSON.stringify(summary),
			new Date().toISOString(),
			workflowId
		).run();
	}

	/**
	 * Get workflow run by ID
	 */
	async getRun(workflowId: string): Promise<WorkflowRunRecord | null> {
		const sql = `SELECT * FROM workflow_runs WHERE id = ?`;
		const result = await this.env.DB.prepare(sql).bind(workflowId).first<WorkflowRunRecord>();
		return result || null;
	}

	/**
	 * Get recent workflow runs
	 */
	async getRecentRuns(
		workflowType?: WorkflowType,
		limit: number = 50
	): Promise<WorkflowRunRecord[]> {
		let sql = `
			SELECT * FROM workflow_runs 
			${workflowType ? 'WHERE workflow_type = ?' : ''}
			ORDER BY created_at DESC 
			LIMIT ?
		`;
		
		const params = workflowType ? [workflowType, limit] : [limit];
		const result = await this.env.DB.prepare(sql).bind(...params).all<WorkflowRunRecord>();
		return result.results || [];
	}

	/**
	 * Get workflow statistics
	 */
	async getStats(days: number = 7): Promise<any> {
		const sql = `
			SELECT 
				workflow_type,
				status,
				COUNT(*) as count,
				AVG(duration_seconds) as avg_duration,
				SUM(total_processed) as total_processed,
				SUM(total_errors) as total_errors,
				MIN(created_at) as oldest_run,
				MAX(created_at) as newest_run
			FROM workflow_runs 
			WHERE created_at > datetime('now', '-' || ? || ' days')
			GROUP BY workflow_type, status
			ORDER BY workflow_type, status
		`;
		
		const result = await this.env.DB.prepare(sql).bind(days).all();
		return result.results || [];
	}

	/**
	 * Get active workflows
	 */
	async getActiveWorkflows(): Promise<any[]> {
		const sql = `SELECT * FROM active_workflows`;
		const result = await this.env.DB.prepare(sql).all();
		return result.results || [];
	}
}