'use strict';

const util = require('util');

const vcapenv = require('abacus-vcapenv');
const webapp = require('abacus-webapp');
const meteringClient = require('abacus-metering-config');
const ratingClient = require('abacus-rating-config');
const pricingClient = require('abacus-pricing-config');
const { ConnectionManager, Consumer, amqpMessageToJSON } = require('abacus-rabbitmq');
const { MessageHandler } = require('./lib/message-handler');
const Meter = require('./lib/meter');
const Normalizer = require('./lib/normalizer');
const ProvisioningClient = require('./lib/provisioning-plugin-client');
const AccumulatorClient = require('./lib/accumulator-client');
const accountClient = require('abacus-accountclient');
const { memoize } = require('underscore');
const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbClient = require('abacus-dbclient');
const partition = require('abacus-partition');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');
const oauth = require('abacus-oauth');
const request = require('abacus-request');
const dbClientWrapper = require('./lib/db-client-wrapper');
const moment = require('abacus-moment');

const brequest = retry(breaker(batch(request)));
const httpClient = {
  get: util.promisify(brequest.get),
  post: util.promisify(brequest.post)
};

const debug = require('abacus-debug')('abacus-usage-meter');

const dbalias = process.env.DBALIAS || 'db';

const uris = memoize(() =>
  urienv({
    [dbalias]: 5984,
    api : 9882,
    auth_server: 9883,
    provisioning: 9880,
    accumulator: 9200
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

// TODO extact config
const queueName = process.env.ABACUS_COLLECT_QUEUE || 'abacus-collect-queue';
const prefetchLimit = process.env.PREFETCH_LIMIT || 100;
const rabbitUris = process.env.RABBIT_URI ?
  [process.env.RABBIT_URI] :
  vcapenv.serviceInstancesCredentials(process.env.RABBIT_SERVICE_NAME, 'uris');
const secured = process.env.SECURED === 'true';

const getMeteringPlan = util.promisify(meteringClient.plan);
const getPricingPlan = util.promisify(pricingClient.plan);

const getMeteringId = util.promisify(meteringClient.id);
const getRatingId = util.promisify(ratingClient.id);
const getPricingId = util.promisify(pricingClient.id);

const errorDb =
  dbClient(checkKeyPart, dbClient.dburi(uris()[dbalias], 'abacus-business-errors'));
const outputDb = dbClient(checkKeyPart, dbClient.dburi(uris()[dbalias], 'abacus-meter-output'));

const buildKeyFn = (usageDoc) => dbClient.tkuri(
  util.format(
    '%s/%s/%s/%s/%s/%s',
    usageDoc.organization_id,
    usageDoc.space_id,
    usageDoc.consumer_id,
    usageDoc.resource_id,
    usageDoc.plan_id,
    usageDoc.resource_instance_id
  ),
  moment
    .utc(usageDoc.start)
    .valueOf());

let server;
let messageConsumer;

const startApp = async() => {
  debug('Starting meter app ...');
  process.env.CLUSTER = false;

  const token = oauth.cache(uris().api,
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET, 'abacus.usage.read abacus.usage.write');

  const auth = () => secured ?
    `Bearer ${token()}` : undefined;

  // const token = oauth.cache(uri, user, pass); // TODO

  debug('Creating provisioning client with url %s', uris().provisioning);
  const provisioningClient = new ProvisioningClient(uris().provisioning, auth());

  const provisioningPluginClient = {
    getResourceType: (resourceId) => provisioningClient.getResourceType(resourceId),
    getPricingPlan: (planId, pricingCountry) =>
      getPricingPlan(planId, pricingCountry, auth())
  };

  const accountPluginClient = {
    getAccount: (usageDoc) => accountClient.getAccount(usageDoc, auth()),
    getMeteringId: (organizationId, resourceType, planId, timestamp) =>
      getMeteringId(organizationId, resourceType, planId, timestamp, auth()),
    getRatingId: (organizationId, resourceType, planId, timestamp) =>
      getRatingId(organizationId, resourceType, planId, timestamp, auth()),
    getPricingId: (organizationId, resourceType, planId, timestamp) =>
      getPricingId(organizationId, resourceType, planId, timestamp, auth())
  };

  /*    Check   */
  // TODO: get rid of meter-db-client.js as we dont really need it.
  // This client does what we need. Same as accountPluginClient above
  debug('Creating meter db client');

  debug('Creating normalizer with provisioning client %o and account client %o',
    provisioningPluginClient, accountPluginClient);
  const normalizer = new Normalizer(provisioningPluginClient, accountPluginClient);

  const meter = new Meter({
    getPlan: (planId) => getMeteringPlan(planId, auth())
  });

  debug('Creating accumulator client with url %s', uris().accumulator);

  const accumulatorClient = new AccumulatorClient(uris().accumulator, httpClient, auth());
  /*   END   */
  const meterOutputDbClient = dbClientWrapper(outputDb, buildKeyFn);
  const meterErrorDbClient = dbClientWrapper(errorDb, buildKeyFn);
  const messageHandler = new MessageHandler(normalizer, meter, accumulatorClient,
    meterOutputDbClient, meterErrorDbClient);
  const amqpMessageHandler = amqpMessageToJSON(messageHandler);

  const connectionManager = new ConnectionManager(rabbitUris[0]);
  const channelConfig = {
    queueName: queueName,
    prefetchLimit: prefetchLimit
  };

  debug('Creating RabbitMQ consumer with channel configuration %o', channelConfig);
  messageConsumer = new Consumer(connectionManager, queueName, prefetchLimit);

  await messageConsumer.process(amqpMessageHandler);

  // TOOD: expose error db
  // TODO: check if we can reuse abacus-bridge/executor
  const app = webapp();
  server = app.listen();
  return server;
};

const runCLI = async() => await startApp();

process.on('SIGTERM', () => {
  debug('Meter is terminated');
  messageConsumer.close();
  server.close();
  process.exit(0);
});

module.exports = startApp;
module.exports.runCLI = runCLI;

