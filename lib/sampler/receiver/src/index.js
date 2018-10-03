'use strict';

const { bind } = require('underscore');
const { MongoClient } = require('mongodb');
const { ProvisioningClient } = require('abacus-api');
const { createSpanDAO } = require('abacus-sampler-storage');
const oauth = require('abacus-oauth');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const { Presenter } = require('./lib/presenter');
const { Controller } = require('./lib/controller');

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const uris = urienv({
  db_uri: 5984,
  auth_server: 9882,
  provisioning: 9880
});

const isSecured = () => process.env.SECURED == 'true';

const listen = (app) => new Promise((resolve, reject) => {
  app.listen(undefined, (err) => {
    if (err)
      reject(err);
    else
      resolve();
  });
});

const startApp = async () => {
  let systemToken;
  if (isSecured()) {
    systemToken = oauth.cache(uris.auth_server, clientId, clientSecret, 'abacus.usage.write');
    const startToken = util.promisify(systemToken.start);
    await startToken();
  }
  const provisioningClient = new ProvisioningClient(uris.provisioning, systemToken);

  const mongoClient = await MongoClient.connect(uris.db_uri, {
    j: true,
    w: 'majority',
    wtimeout: 5000
  });
  const spanDAO = await createSpanDAO(mongoClient, 'spans');
  const controller = new Controller({
    spanDAO: spanDAO,
    provisioningClient: provisioningClient
  });
  const presenter = new Presenter(controller);

  const app = webapp();
  if (isSecured())
    app.use(oauth.authorizer(process.env.JWTKEY, process.env.JWTALGO, ['abacus.sampler.usage.write']));

  app.post('/v1/events/start', bind(presenter.handleStart, presenter));
  app.post('/v1/events/stop', bind(presenter.handleStop, presenter));
  app.post('/v1/mappings', bind(presenter.handleMappings, presenter));
  await listen(app);
};

module.exports = {
  runCLI: async () => await startApp()
};
