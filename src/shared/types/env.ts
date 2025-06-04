export type Env = {
	ZILLOW_DATA_COLLECTOR: Workflow;
	ZILLOW_PROPERTY_DETAILS: Workflow;
	ZILLOW_DATA_BUCKET: R2Bucket;
	DB: D1Database;
	BRIGHTDATA_API_TOKEN: string;
	WEBHOOK_SECRET: string;
	API_KEY: string;
	CLERK_PUBLIC_KEY?: string; // For production JWT verification
	ENVIRONMENT?: string;
	WORKER_URL?: string;
	CF?: any; // Cloudflare context
};
