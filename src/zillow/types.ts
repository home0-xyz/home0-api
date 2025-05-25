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
