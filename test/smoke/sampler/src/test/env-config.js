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

module.exports = { env };
