'use strict';

const { bind } = require('underscore');
const { MongoClient } = require('mongodb');
const { ProvisioningClient } = require('abacus-api');
const { createSpanDAO } = require('abacus-sampler-storage');
const oauth = require('abacus-oauth');
const webapp = require('abacus-webapp');
const { Presenter } = require('./lib/presenter');
const { Controller } = require('./lib/controller');

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const provisioningURL = process.env.PROVISIONING_URL || 'http://localhost:9880';

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
  const mongoClient = await MongoClient.connect(mongoURI, {
    j: true,
    w: 'majority',
    wtimeout: 5000
  });
  const spanDAO = await createSpanDAO(mongoClient, 'spans');
  const provisioningClient = new ProvisioningClient(provisioningURL);
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
