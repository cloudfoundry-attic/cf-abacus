'use strict';

// Usage collector service, responsible for receiving usage data batches
// submitted by service providers and storing them in the usage db.

const util = require('util');

const httpStatus = require('http-status-codes');
const { extend, memoize } = require('underscore');

const accountClient = require('abacus-accountclient');
const { ProvisioningClient, BearerAuthHeaderProvider, VoidAuthHeaderProvider, RequestStrategy } = require('abacus-api');
const oauth = require('abacus-oauth');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const schema = require('abacus-usage-schemas');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const metrics = require('abacus-metrics');
const docid = require('abacus-docid');

const { bufferConfig, envReader } = require('abacus-config');
const { ConnectionManager, Producer } = require('abacus-rabbitmq');

const { createCollectorConfiguration } = require('./lib/config');
const {
  UsageValidator,
  InvalidSchemaError,
  InvalidPlanError,
  UnsupportedLicenseTypeError
} = require('./lib/usage-validator');
const { createCollector } = require('./lib/collector');

const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

const collectorConfig = createCollectorConfiguration(bufferConfig, envReader);

const UNAVAILABLE_FOR_LEGAL_REASONS = 451;

const uris = memoize(() => urienv({
  api : 9882,
  auth_server: 9883,
  provisioning: 9880
}));

const baseUrl = (req) => req ? req.protocol + '://' + req.headers.host + (req.baseUrl || '') : 'http://localhost:9080';

const getLocation = (usageDoc, baseUrl) => {
  return `${baseUrl}/v1/metering/collected/usage/${docid.createMeterId(usageDoc)}`;
};


const authorize = (req) => {
  if(!collectorConfig.secured)
    return;

  const usageDoc = req.body;

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

/* eslint-disable complexity */
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

  const createAuthHeaderProvider = () => {
    if (!secured)
      return new VoidAuthHeaderProvider();

    return new BearerAuthHeaderProvider({
      uaaUrl: uris().api,
      clientId: collectorConfig.clientId,
      clientSecret: collectorConfig.clientSecret,
      scopes: 'abacus.usage.read abacus.usage.write'
    });
  };

  const provisioningClient = new ProvisioningClient(
    uris().provisioning, {
      authHeaderProvider: createAuthHeaderProvider(),
      skipSslValidation: skipSslValidation
    },
    RequestStrategy.reliable()
  );

  const usageValidator = new UsageValidator(schema, provisioningClient, {
    validateAccount: (usage) => accountClient.validateAccount(usage, token(), collectorConfig.unsupportedLicenses)
  });

  debug('Creating collector');
  const collector = createCollector(usageValidator, producer);

  routes.post('/v1/metering/collected/usage', async(request) => {
    metrics.counter('post.usage.count').inc();

    if (!request.body || !request.body.resource_id)
      return { status: httpStatus.BAD_REQUEST };

    authorize(request);

    const usageDoc = extend({}, request.body, { processed_id: seqid() });
    debug('Received usage doc %o', usageDoc);

    try {
      await collector.collect(usageDoc);
      return {
        statusCode: httpStatus.ACCEPTED,
        header: {
          Location: getLocation(usageDoc, baseUrl(request))
        }
      };
    } catch (error) {
      edebug('Error while collecting usage: ', error);
      if (error instanceof InvalidSchemaError || error instanceof InvalidPlanError)
        return {
          statusCode: httpStatus.BAD_REQUEST
        };

      if (error instanceof UnsupportedLicenseTypeError)
        return {
          statusCode: UNAVAILABLE_FOR_LEGAL_REASONS
        };

      return {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR
      };
    }
  });

  app.use(routes);
  app.use(router.batch(app));

  return app.listen();
};

const runCLI = async() => await startApp();

module.exports = startApp;
module.exports.runCLI = runCLI;
