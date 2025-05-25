// BrightData response types
export type BrightDataTriggerResponse = {
	snapshot_id: string;
	status: 'running' | 'ready' | 'failed';
};

export type BrightDataStatusResponse = {
	snapshot_id: string;
	status: 'running' | 'ready' | 'failed';
	url?: string;
};

// BrightData webhook types
export type BrightDataWebhookPayload = {
	snapshot_id: string;
	status: 'initializing' | 'running' | 'ready' | 'failed';
	progress?: number;
	error?: string;
	timestamp?: string;
};

export type BrightDataDataDelivery = {
	snapshot_id: string;
	data: any[];
};
