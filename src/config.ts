// Configuration constants for the Home0 platform

export const BRIGHTDATA_CONFIG = {
  zillow: {
    searchDatasetId: 'gd_lfqkr8wm13ixtbd8f5',
    detailsDatasetId: 'gd_m794g571225l6vm7gh',
  }
};

export const WORKFLOW_CONFIG = {
  maxRetries: 20,
  retryDelayMs: 30000,
  maxWaitTimeMs: 600000, // 10 minutes
  defaultBatchSize: 10,
};

export const API_CONFIG = {
  brightDataBaseUrl: 'https://api.brightdata.com/datasets/v3',
};

export const DATABASE_CONFIG = {
  defaultPageSize: 50,
  maxPageSize: 100,
};