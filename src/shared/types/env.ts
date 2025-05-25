export type Env = {
	ZILLOW_DATA_COLLECTOR: Workflow;
	ZILLOW_PROPERTY_DETAILS: Workflow;
	ZILLOW_DATA_BUCKET: R2Bucket;
	DB: D1Database;
	BRIGHTDATA_API_TOKEN: string;
};
