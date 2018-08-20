'use strict';

const util = require('util');
const { memoize } = require('underscore');

const batch = require('abacus-batch');
const oauth = require('abacus-oauth');
const retry = require('abacus-retry');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const urienv = require('abacus-urienv');
const breaker = require('abacus-breaker');
const request = require('abacus-request');
const dbClient = require('abacus-dbclient');
const partition = require('abacus-partition');
const ratingClient = require('abacus-rating-config');
const accountClient = require('abacus-accountclient');
const pricingClient = require('abacus-pricing-config');
const { bufferConfig, envReader } = require('abacus-config');
const meteringClient = require('abacus-metering-config');
const { ConnectionManager, Consumer, amqpMessageParser } = require('abacus-rabbitmq');

const Meter = require('./lib/meter');
const Normalizer = require('./lib/normalizer');
const { createMeterConfiguration } = require('./lib/config');
const dbClientWrapper = require('./lib/db-client-wrapper');
const createRequestRouting = require('./lib/request-routing');
const AccumulatorClient = require('./lib/accumulator-client');
const { createMessageHandler } = require('./lib/message-handler');
const createRetriever = require('./lib/routes/document-retriver');
const ProvisioningClient = require('./lib/provisioning-plugin-client');

const debug = require('abacus-debug')('abacus-usage-meter');

const meterConfig = createMeterConfiguration(bufferConfig, envReader);

const dbalias = meterConfig.db.alias;

const uris = memoize(() =>
  urienv({
    [dbalias]: 5984,
    auth_server : 9882,
    provisioning: 9880,
    accumulator: 9200
  })
);

const buildKeyFn = (usageDoc) => {
  return util.format(
    't/%s/k/%s/%s/%s/%s/%s/%s',
    dbClient.pad16(usageDoc.end),
    usageDoc.organization_id,
    usageDoc.space_id,
    usageDoc.consumer_id,
    usageDoc.resource_id,
    usageDoc.plan_id,
    usageDoc.resource_instance_id
  );
};

const unsupportedPutFn = () => {
  throw new Error('Unsupported database PUT operation');
};

const authorize = (secured, token) => ({
  createHeader: async() => {
    if(!secured)
      return undefined;

    return token();
  }
});

const createAccountPluginClient = (auth) => {
  const getRatingId = util.promisify(ratingClient.id);
  const getPricingId = util.promisify(pricingClient.id);
  const getMeteringId = util.promisify(meteringClient.id);

  return {
    getAccount: async(usageDoc) => accountClient.getAccount(usageDoc, await auth.createHeader()),
    getMeteringId: async(organizationId, resourceType, planId, timestamp) =>
      getMeteringId(organizationId, resourceType, planId, timestamp, await auth.createHeader()),
    getRatingId: async(organizationId, resourceType, planId, timestamp) =>
      getRatingId(organizationId, resourceType, planId, timestamp, await auth.createHeader()),
    getPricingId: async(organizationId, resourceType, planId, timestamp) =>
      getPricingId(organizationId, resourceType, planId, timestamp, await auth.createHeader())
  };
};

const createProvisioningPluginClient = (auth) => {
  const provisioningClient = new ProvisioningClient(uris().provisioning, auth);
  const getPricingPlan = util.promisify(pricingClient.plan);
  return {
    getResourceType: (resourceId) => provisioningClient.getResourceType(resourceId),
    getPricingPlan: async(planId, pricingCountry) =>
      getPricingPlan(planId, pricingCountry, await auth.createHeader())
  };
};

const createDocumentRetriever = (partitioner, meterDbClient) => {
  // TODO: Remove default partitioner after 3 months (20.06.2018)
  const defaultPartitioner = partition.partitioner(
    partition.bucket,
    partition.period,
    partition.forward,
    partition.balance,
    true
  );
  // TODO: Remove collectorDB and default partitioner DBs after retention period
  const outputDbDefaultPartitioner = dbClientWrapper(
    dbClient(defaultPartitioner, dbClient.dburi(uris()[dbalias], 'abacus-meter')),
    unsupportedPutFn
  );
  const errorDbDefaultPartitioner = dbClientWrapper(
    dbClient(defaultPartitioner, dbClient.dburi(uris()[dbalias], 'abacus-business-errors')),
    unsupportedPutFn
  );
  const collectorInputDb = dbClient(partitioner, dbClient.dburi(uris()[dbalias], 'abacus-collector-collected-usage'));
  const collectorInputDbClient = dbClientWrapper(collectorInputDb, unsupportedPutFn);
  return createRetriever(meterDbClient.output, meterDbClient.error, collectorInputDbClient,
    outputDbDefaultPartitioner, errorDbDefaultPartitioner);
};

const createAccumulatorClient = (auth) => {
  const brequest = retry(breaker(batch(request)));
  const httpClient = {
    get: util.promisify(brequest.get),
    post: util.promisify(brequest.post)
  };
  const urlBuilder = createRequestRouting(partition, process.env.ACCUMULATOR_APPS, uris().accumulator);
  return new AccumulatorClient(urlBuilder, httpClient, auth);
};

const createMeterDbClient = (partitioner) => {
  const errorDb = dbClient(partitioner, dbClient.dburi(uris()[dbalias], 'abacus-business-errors'));
  const outputDb = dbClient(partitioner, dbClient.dburi(uris()[dbalias], 'abacus-meter'));

  return {
    output: dbClientWrapper(outputDb, buildKeyFn),
    error: dbClientWrapper(errorDb, buildKeyFn)
  };
};

let messageConsumer;
const startApp = async() => {
  debug('Starting meter app with configuration: %o', meterConfig);

  const token = oauth.cache(
    uris().auth_server,
    meterConfig.clientId,
    meterConfig.clientSecret,
    'abacus.usage.read abacus.usage.write');
  const secured = meterConfig.secured;

  if(secured)
    await util.promisify(token.start)();

  debug('Creating authorization');
  const auth = authorize(secured, token);

  debug('Creating provisioning client with url %s', uris().provisioning);
  const provisioningPluginClient = createProvisioningPluginClient(auth);

  debug('Creating account plugin client');
  const accountPluginClient = createAccountPluginClient(auth);

  debug('Creating normalizer');
  const normalizer = new Normalizer(provisioningPluginClient, accountPluginClient);

  debug('Creating meter');
  const getMeteringPlan = util.promisify(meteringClient.plan);
  const meter = new Meter({ getPlan: async(planId) => getMeteringPlan(planId, await auth.createHeader()) });

  debug('Creating accumulator client with url %s', uris().accumulator);
  const accumulatorClient = createAccumulatorClient(auth);

  // Partitioning function that can be used for range queries
  const partitioner = partition.partitioner(
    partition.bucket,
    partition.period,
    partition.createForwardFn(meterConfig.db.partitions, 4000),
    partition.balance,
    true
  );

  debug('Creating meter db client');
  const meterDbClient = createMeterDbClient(partitioner);

  const maxUsageFails =
    meterConfig.rabbitMQ.deadLetterQueues[0].retryAttempts + meterConfig.rabbitMQ.deadLetterQueues[1].retryAttempts;
  debug(`Creating message handler with allowed fails ${maxUsageFails}`);
  const messageHandler = createMessageHandler(normalizer, meter, accumulatorClient, meterDbClient, maxUsageFails);

  debug('Creating connection manager');
  const connectionManager = new ConnectionManager(meterConfig.rabbitMQ.uris);

  debug('Creating consumer with configuration %o', meterConfig.rabbitMQ);
  messageConsumer = new Consumer(connectionManager, amqpMessageParser, meterConfig.rabbitMQ);

  debug('Creating document retriever');
  const documentRetriever = createDocumentRetriever(partitioner, meterDbClient);

  debug('Processing documents from queue');
  await messageConsumer.process(messageHandler);

  const routes = router();
  routes.get('/v1/metering/collected/usage/t/:time/k/:key(*)', require('./lib/routes')(documentRetriever, secured));

  const app = webapp();
  app.use(routes);

  if (secured)
    app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(meterConfig.jwtKey, meterConfig.jwtAlgo));

  return app.listen();
};

let server;
const runCLI = async() => {
  server = await startApp();
};

process.on('SIGTERM', () => {
  debug('Meter is terminated');
  messageConsumer.close();
  if (server) server.close();
  process.exit(0);
});

module.exports = startApp;
module.exports.runCLI = runCLI;
