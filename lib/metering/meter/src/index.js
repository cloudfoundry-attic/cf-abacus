'use strict';

const util = require('util');

const webapp = require('abacus-webapp');
const meteringClient = require('abacus-metering-config');
const ratingClient = require('abacus-rating-config');
const pricingClient = require('abacus-pricing-config');
const { ConnectionManager, Consumer } = require('abacus-rabbitmq');
const { MessageHandler } = require('./lib/message-handler');
const Meter = require('./lib/meter');
const Normalizer = require('./lib/normalizer');
const ProvisioningClient = require('./lib/provisioning-plugin-client');
const AccumulatorClient = require('./lib/accumulator-client');
const accountClient = require('abacus-accountclient');
const debug = require('abacus-debug')('abacus-usage-meter');
const { memoize } = require('underscore');
const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbClient = require('abacus-dbclient');
const partition = require('abacus-partition');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const dbalias = process.env.DBALIAS || 'db';

const uris = memoize(() =>
  urienv({
    [dbalias]: 5984,
    api : 9882,
    auth_server: 9883,
    provisioning: 9880
  })
);

// Partitioning function that can be used for range queries
const checkKeyPart = partition.partitioner(
  partition.bucket,
  partition.period,
  partition.forward,
  partition.balance,
  true
);

const errorDb = throttle(
  retry(breaker(batch(dbClient(checkKeyPart, dbClient.dburi(uris()[dbalias], 'abacus-business-errors')))))
);

// TODO extact config
const queueName = process.env.ABACUS_COLLECT_QUEUE || 'abacus-collect-queue';
const rabbitUri = process.env.RABBIT_URI ? process.env.RABBIT_URI : process.env.VCAP_SERVICES.rabbitmq[0].uri ;
// const api = process.env.CF_API;
const secured = process.env.SECURED === 'true';

const getMeteringPlan = util.promisify(meteringClient.plan);
const getPricingPlan = util.promisify(pricingClient.plan);

const getMeteringId = util.promisify(meteringClient.id);
const getRatingId = util.promisify(ratingClient.id);
const getPricingId = util.promisify(pricingClient.id);


let server;
let messageConsumer;

// const createAuthHeader = (token) => `Bearer ${token()}`;

const startApp = () => {
  debug('Starting meter app ...');
  process.env.CLUSTER = false;

  const token = oauth.cache(config.uris().api,
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET, 'abacus.usage.read abacus.usage.write');

  const auth = () => secured ?
    `Bearer ${token()}` : undefined;

  // const token = oauth.cache(uri, user, pass); // TODO

  const meter = new Meter({
    getPlan: (planId) => getMeteringPlan(planId, auth)
  });

  const provisioningClient = new ProvisioningClient(rootProvisioningPluginUrl, auth);
  const provisioningPluginClient = {
    getResourceType: (resourceId) => provisioningClient.getResourceType(resourceId),
    getPricingPlan: (planId, pricingCountry) =>
      getPricingPlan(planId, pricingCountry, auth)
  };
  const accountPluginClient = {
    getAccount: (usageDoc) => accountClient.getAccount(usageDoc, auth),
    getMeteringId: (organizationId, resourceType, planId, timestamp) =>
      getMeteringId(organizationId, resourceType, planId, timestamp, auth),
    getRatingId: (organizationId, resourceType, planId, timestamp) =>
      getRatingId(organizationId, resourceType, planId, timestamp, auth),
    getPricingId: (organizationId, resourceType, planId, timestamp) =>
      getPricingId(organizationId, resourceType, planId, timestamp, auth)
  };
  const normalizer = new Normalizer(provisioningPluginClient, accountPluginClient);
  const accumulatorClient = new AccumulatorClient(rootAccumulatorUrl, auth);
  const messageHandler = new MessageHandler(normalizer, meter, accumulatorClient, errorDb);

  const connectionManager = new ConnectionManager([rabbitUri]);
  messageConsumer = new Consumer(connectionManager, queueName);
  messageConsumer.process(messageHandler);

  // TOOD: expose error db
  // TODO: check if we can reuse abacus-bridge/executor
  const app = webapp();
  server = app.listen();
  return server;
};

const runCLI = () => startApp();

process.on('SIGTERM', () => {
  debug('Meter is terminated');
  messageConsumer.close();
  server.close();
  process.exit(0);
});

module.exports = startApp;
module.exports.runCLI = runCLI;

