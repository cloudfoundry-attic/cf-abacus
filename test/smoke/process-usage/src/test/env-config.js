'use strict';

const testEnv = {
  collectorUrl: process.env.COLLECTOR_URL || 'http://localhost:9080',
  reportingUrl: process.env.REPORTING_URL || 'http://localhost:9088',
  authServer: process.env.AUTH_SERVER || 'http://localhost:9882',
  startTimeout: process.env.SMOKE_START_TIMEOUT || 10000,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 60000,
  pollInterval: process.env.POLL_INTERVAL || 300,
  systemClientId: process.env.SYSTEM_CLIENT_ID,
  systemClientSecret: process.env.SYSTEM_CLIENT_SECRET,
  secured: process.env.SECURED === 'true',
  objectStorageClientId: process.env.OBJECT_STORAGE_CLIENT_ID,
  objectStorageClientSecret: process.env.OBJECT_STORAGE_CLIENT_SECRET,
  usageDocumentsCount: process.env.USAGE_DOCUMENTS_COUNT ? parseInt(process.env.USAGE_DOCUMENTS_COUNT) : 3
};

module.exports = {
  testEnv
};
