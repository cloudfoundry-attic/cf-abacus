'use strict';

const env = {
  api: process.env.CF_API_URI,
  receiverUrl: process.env.RECEIVER_URL || 'http://localhost:7070',
  reportingUrl: process.env.REPORTING_URL || 'http://localhost:9088',
  skipSSL: process.env.SKIP_SSL_VALIDATION || false,
  secured: process.env.SECURED === 'true',
  clientId: process.env.SAMPLER_CLIENT_ID,
  clientSecret: process.env.SAMPLER_CLIENT_SECRET,
  systemClientId: process.env.SYSTEM_CLIENT_ID,
  systemClientSecret: process.env.SYSTEM_CLIENT_SECRET,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 60000,
  pollInterval: process.env.POLL_INTERVAL || 300
};

const spanConfig = {
  organization_id: '62332d73-d1ce-4da1-8455-64cc0f7e0b47',
  space_id: 'bcedeb4a-641e-4d80-9e35-435cbaf79d5c',
  consumer_id: '92d9ef8b-fd71-46d7-b460-e64f44e18f18',
  resource_id: 'sampler-postgresql',
  plan_id: 'v9.4-large',
  resource_instance_id: '2249be66-9f05-4525-a09e-955ae2ab53c1',
  metering_plan: 'standard-services-hours',
  rating_plan: 'standard-services-hours',
  pricing_plan: 'standard-services-hours'
};

module.exports = {
  env,
  spanConfig
};
