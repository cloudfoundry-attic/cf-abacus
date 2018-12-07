'use strict';

// Usage collector service, responsible for receiving usage data batches
// submitted by service providers and storing them in the usage db.

const util = require('util');

const httpStatus = require('http-status-codes');
const { extend, memoize } = require('underscore');

const accountClient = require('abacus-accountclient');
const { ProvisioningClient, BearerAuthHeaderProvider, RequestStrategy } = require('abacus-api');
const oauth = require('abacus-oauth');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const schema = require('abacus-usage-schemas');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const metrics = require('abacus-metrics');
const { bufferConfig, envReader } = require('abacus-config');
const { ConnectionManager, Producer } = require('abacus-rabbitmq');

const { createCollectorConfiguration } = require('./lib/config');
const { UsageValidator } = require('./lib/usage-validator');
const { createCollector } = require('./lib/collector');

const debug = require('abacus-debug')('abacus-usage-collector');

const collectorConfig = createCollectorConfiguration(bufferConfig, envReader);

const uris = memoize(() => urienv({
  api : 9882,
  auth_server: 9883,
  provisioning: 9880
}));

const baseUrl = (req) => req ? req.protocol + '://' + req.headers.host + (req.baseUrl || '') : 'http://localhost:9080';

const authorize = (req, usageDoc) => {
  if(!collectorConfig.secured)
    return;

  oauth.authorize(req && req.headers && req.headers.authorization, {
    resource: [['abacus.usage', usageDoc.resource_id, 'write'].join('.')],
    internalResource: ['abacus.usage.sampler.write'],
    system: ['abacus.usage.write']
  });
};

const createProducer = async() => {
  const connManager = new ConnectionManager(collectorConfig.rabbitUris[0]);
  const producer = new Producer(connManager, collectorConfig.collectQueue);

  await producer.connect();
  return producer;
};

const startApp = async() => {
  debug('Starting collector app with configuration: %o', collectorConfig);

  const app = webapp();
  const routes = router();

  const secured = collectorConfig.secured;

  let token;
  if(!secured)
    token = () => {};
  else {
    app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(collectorConfig.jwtKey, collectorConfig.jwtAlgo));
    token = oauth.cache(
      uris().auth_server,
      collectorConfig.clientId,
      collectorConfig.clientSecret,
      'abacus.usage.read abacus.usage.write');
    await util.promisify(token.start)();
  }

  debug('Creating producer');
  const producer = await createProducer();

  debug('Creating validator');

  const skipSslValidation = process.env.SKIP_SSL_VALIDATION === 'true';
  const authHeaderProvider = new BearerAuthHeaderProvider({
    uaaUrl: uris().api,
    clientId: collectorConfig.clientId,
    clientSecret: collectorConfig.clientSecret,
    scopes: 'abacus.usage.read abacus.usage.write'
  });

  const provisioningClient = new ProvisioningClient(
    uris().provisioning, {
      authHeaderProvider,
      skipSslValidation
    },
    RequestStrategy.reliable()
  );

  const usageValidator = new UsageValidator(schema, provisioningClient, {
    validateAccount: (usage) => accountClient.validateAccount(usage, token, unsupportedLicenses)
  });

  debug('Creating collector');
  const collector = createCollector(usageValidator, producer);

  routes.post('/v1/metering/collected/usage', async(request) => {
    metrics.counter('post.usage.count').inc();

    const usageDoc = extend({}, request.body, { processed_id: seqid() });
    debug('Received usage doc %o', usageDoc);

    if (!usageDoc || !usageDoc.resource_id)
      return { status: httpStatus.BAD_REQUEST };

    authorize(request, usageDoc);

    return await collector.collect(usageDoc, token(), baseUrl(request));
  });

  app.use(routes);
  app.use(router.batch(app));

  return app.listen();
};

const runCLI = async() => await startApp();

module.exports = startApp;
module.exports.runCLI = runCLI;
