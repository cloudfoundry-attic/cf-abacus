'use strict';

const httpStatus = require('http-status-codes');
const { bind } = require('underscore');
const { MongoClient } = require('mongodb');
const { ProvisioningClient, BearerAuthHeaderProvider, VoidAuthHeaderProvider } = require('abacus-api');
const { createSpanDAO } = require('abacus-sampler-storage');
const { createHealthMonitor } = require('abacus-healthmonitor');
const oauth = require('abacus-oauth');
const router = require('abacus-router');
const moment = require('abacus-moment');
const webapp = require('abacus-webapp');
const debug = require('abacus-debug')('abacus-sampler-receiver');
const edebug = require('abacus-debug')('e-abacus-sampler-receiver');
const { Presenter } = require('./lib/presenter');
const { Controller } = require('./lib/controller');
const { validateJsonMediaType } = require('./lib/json-media-type-validator');
const { SchemaValidator } = require('./lib/schema-validator');
const { SlackValidator } = require('./lib/slack-validator');

const oneMinuteInMs = moment.duration(1, 'minute').asMilliseconds();
const twoMonthsInMs = moment.duration(2, 'months').asMilliseconds();

const cfg = {
  isSecured: process.env.SECURED === 'true',
  skipSslValidation : process.env.SKIP_SSL_VALIDATION === 'true',
  mongoUri : process.env.DB_URI || 'mongodb://localhost:27017',
  authServerUrl: process.env.AUTH_SERVER || 'http://localhost:9882',
  provisioningUrl: process.env.PROVISIONING_URL || 'http://localhost:9880',
  spansCollectioName : process.env.SPANS_COLLECTION_NAME || 'spans',
  threshold : parseInt(process.env.HEALTHCHECK_THRESHOLD) || oneMinuteInMs,
  clientId : process.env.CLIENT_ID,
  clientSecret : process.env.CLIENT_SECRET,
  slack : {
    pastInterval: process.env.SAMPLER_SLACK_PAST_INTERVAL || twoMonthsInMs,
    futureInterval: process.env.SAMPLER_SLACK_FUTURE_INTERVAL || twoMonthsInMs
  }
};

const listen = (app) => new Promise((resolve, reject) => {
  app.listen(undefined, (err) => {
    if (err)
      reject(err);
    else
      resolve();
  });
});

const createHealthcheckHandler = (presenter) => {
  const eventsHealthMonitor = createHealthMonitor(presenter, cfg.threshold, {
    success: [
      Presenter.Events.start.successful, Presenter.Events.start.conflict, Presenter.Events.stop.successful,
      Presenter.Events.stop.conflict, Presenter.Events.stop.missingSpan, Presenter.Events.stop.outOfOrder
    ],
    failure: [
      Presenter.Events.start.failure, Presenter.Events.stop.failure
    ]
  });
  const mappingsHealthMonitor = createHealthMonitor(presenter, cfg.threshold, {
    success: [
      Presenter.Events.mappings.successful, Presenter.Events.mappings.conflict
    ],
    failure: [
      Presenter.Events.mappings.failure
    ]
  });

  const handler = (req, res) => {
    const healthy = eventsHealthMonitor.healthy() && mappingsHealthMonitor.healthy();
    res.status(healthy ? httpStatus.OK : httpStatus.INTERNAL_SERVER_ERROR).send({
      healthy
    });
  };

  return handler;
};

const createAuthHeaderProvider = () => {
  if (!cfg.isSecured) 
    return new VoidAuthHeaderProvider();

  return new BearerAuthHeaderProvider({ 
    uaaUrl: cfg.authServerUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    scopes: 'abacus.usage.write'
  });
};

const startApp = async () => {
  const authHeaderProvider = createAuthHeaderProvider();
  const provisioningClient = new ProvisioningClient(cfg.provisioningUrl, authHeaderProvider, cfg.skipSslValidation);

  const mongoClient = await MongoClient.connect(cfg.mongoUri, {
    j: true,
    w: 'majority',
    wtimeout: 5000
  });
  const spanDAO = await createSpanDAO(mongoClient, cfg.spansCollectioName);
  const controller = new Controller({
    spanDAO: spanDAO,
    provisioningClient: provisioningClient
  });
  const presenter = new Presenter(controller,
    new SchemaValidator(),
    new SlackValidator(cfg.slack)
  );

  const startRoute = router().use(validateJsonMediaType);
  const stopRoute = router().use(validateJsonMediaType);
  const mappingsRoute = router().use(validateJsonMediaType);

  if (cfg.isSecured) {
    const authorizer = oauth.authorizer(process.env.JWTKEY, process.env.JWTALGO, ['abacus.sampler.write']);
    startRoute.use(authorizer);
    stopRoute.use(authorizer);
    mappingsRoute.use(authorizer);
  }

  startRoute.post('/', bind(presenter.handleStart, presenter));
  stopRoute.post('/', bind(presenter.handleStop, presenter));
  mappingsRoute.post('/', bind(presenter.handleMappings, presenter));

  const app = webapp();
  app.use('/v1/events/start', startRoute);
  app.use('/v1/events/stop', stopRoute);
  app.use('/v1/mappings', mappingsRoute);
  app.useHealthCheck(createHealthcheckHandler(presenter));
  await listen(app);
};

const runCLI = () => {
  startApp().then(() => {
    debug('Receiver web application is successfully started.');
  }).catch((err) => {
    edebug('Error while starting receiver web application. Error: %o', err);
    process.exit(1);
  });
};
module.exports.runCLI = runCLI;
