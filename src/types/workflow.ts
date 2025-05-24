// User-defined params passed to your workflow
export type WorkflowParams = {
	email: string;
	metadata: Record<string, string>;
};

// Parameters for zillow data collection
export type ZillowCollectionParams = {
	location: string;
	listingCategory?: string;
	homeType?: string;
	daysOnZillow?: string;
	exactAddress?: boolean;
};

// Parameters for zillow property details collection
export type ZillowPropertyDetailsParams = {
	zpids: string[];
	batchSize?: number;
	source?: 'manual' | 'auto' | 'collection_id';
	collectionId?: string;
};
