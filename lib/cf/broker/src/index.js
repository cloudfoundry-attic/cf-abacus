'use strict';

const perf = require('abacus-perf');
const moment = require('abacus-moment');
const router = require('abacus-router');
const webapp = require('abacus-webapp');
const { ServiceMappingClient, ProvisioningClient, BearerAuthHeaderProvider } = require('abacus-api');

const config = require('./config.js');
const oauth = require('./auth/oauth.js');
const basicAuth = require('./auth/basic.js');

const debug = require('abacus-debug')('abacus-broker');

const skipSslValidation = process.env.SKIP_SSL_VALIDATION === 'true';
const createService = require('./routes/create-service.js');
const authHeaderProvider = new BearerAuthHeaderProvider({
  uaaUrl: config.uris().api,
  clientId: process.env.SERVICE_BROKER_CLIENT_ID,
  clientSecret: process.env.SERVICE_BROKER_CLIENT_SECRET,
  scopes: process.env.SERVICE_BROKER_CLIENT_SCOPES || 'abacus.usage.read abacus.usage.write'
});
const serviceMappingClient = new ServiceMappingClient(config.getMappingApi(), authHeaderProvider, skipSslValidation);
const provisioningClient = new ProvisioningClient(config.uris().provisioning, authHeaderProvider, skipSslValidation);

const routes = router();

routes.get('/v2/catalog',
  basicAuth, require('./routes/get-catalog.js'));
routes.put('/v2/service_instances/:instance_id',
  basicAuth, createService(serviceMappingClient, provisioningClient).createService);
routes.delete('/v2/service_instances/:instance_id',
  basicAuth, require('./routes/delete-service.js'));
routes.put('/v2/service_instances/:instance_id/service_bindings/:binding_id',
  basicAuth, require('./routes/bind-service.js'));
routes.delete('/v2/service_instances/:instance_id/service_bindings/:binding_id',
  basicAuth, require('./routes/unbind-service.js'));
routes.patch('/v2/service_instances/:instance_id',
  basicAuth, require('./routes/update-service.js'));

const broker = () => {
  debug('Starting broker');

  const app = webapp();
  app.use(routes);

  return app;
};

const startBroker = () => {
  debug('Starting broker app');

  const t0 = moment.now();
  oauth.init((err) => {
    if(!err)
      broker().listen();
    else {
      debug('Failed to obtain system OAuth token due to %o', err);
      perf.report('oauth', t0, undefined, err);
    }
  });
};

const runCLI = () => {
  startBroker();
};

// Export our public functions
module.exports = broker;
module.exports.config = require('./config.js');
module.exports.runCLI = runCLI;
