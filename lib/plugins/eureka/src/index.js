'use strict';

// Minimalistic plugin for a Eureka compatible service registry.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-oauth');
const urienv = require('abacus-urienv');
const dbclient = require('abacus-dbclient');
const partition = require('abacus-partition');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');

const extend = _.extend;
const omit = _.omit;

// Setup debug log
const debug = require('abacus-debug')('abacus-eureka-plugin');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const uris = urienv({
  db: 5984
});

// Configure app instance db
const db = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-app-instances'))))));

// Create an express router
const routes = router();

// Return an app instance
routes.get('/eureka/v2/apps/:app/:instance', function *(req) {
  debug('Retrieving app %s instance %s',
    req.params.app, req.params.instance);

  const idoc = yield db.get(
    dbclient.kturi([req.params.app, req.params.instance].join('/'), 0));
  if (!idoc)
    return {
      status: 404
    };

  // Mongo does not allow fields starting with $
  // Rename port "number"-s to "$" as eureka would return them
  idoc.instance.port.$ = idoc.instance.port.number;
  delete idoc.instance.port.number;
  idoc.instance.securePort.$ = idoc.instance.securePort.number;
  delete idoc.instance.securePort.number;

  return {
    status: 200,
    body: omit(dbclient.undbify(idoc), 'id')
  };
});

// Create a new app instance
routes.post('/eureka/v2/apps/:app', function *(req) {
  const instance = req.body.instance;
  debug('Storing app %s instance %s', req.params.app, instance.hostName);

  // Look for already existing instance doc
  const id = dbclient.kturi([req.params.app, instance.hostName].join('/'), 0);
  const idoc = yield db.get(id);

  // Store new instance doc, compatible with Eureka instance info
  const now = Date.now();
  const nidoc = extend({
    instance: {
      hostName: instance.hostName,
      app: instance.app,
      ipAddr: instance.ipAddr,
      vipAddress: instance.vipAddress,
      status: instance.status,
      overriddenstatus: 'UNKNOWN',
      port: {
        '@enabled': 'true',
        'number': instance.port.toString()
      },
      securePort: {
        '@enabled': 'false',
        'number': '7002'
      },
      countryId: 1,
      dataCenterInfo: {
        '@class': '',
        name: instance.dataCenterInfo.name
      },
      leaseInfo: {
        renewalIntervalInSecs: 30,
        durationInSecs: 90,
        registrationTimestamp: now,
        lastRenewalTimestamp: now,
        evictionTimestamp: 0,
        serviceUpTimestamp: now
      },
      metadata: {
        '@class': ''
      },
      isCoordinatingDiscoveryServer: false,
      lastUpdatedTimestamp: now,
      lastDirtyTimestamp: now,
      actionType: 'ADDED'
    }
  }, {
    _id: id,
    id: id
  }, idoc ? {
    _rev: idoc._rev
  } : {});
  yield db.put(nidoc);
  return {
    status: 201
  };
});

// Delete an app instance
routes.delete('/eureka/v2/apps/:app/:instance', function *(req) {
  debug('Deleting app %s instance %s', req.params.app, req.params.instance);
  const id = dbclient.kturi(
    [req.params.app, req.params.instance].join('/'), 0);
  const idoc = yield db.get(id);
  if(!idoc)
    return {
      status: 404
    };

  yield db.remove(idoc);
  return {
    status: 200
  };
});

// Create a Eureka service registry app
const eureka = () => {
  // Create the Webapp
  const app = webapp();

  // Secure provisioning and batch routes using an OAuth
  // bearer access token
  if (secured())
    app.use(/^\/eureka\/v2/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));

  return app;
};

// Command line interface, create the app and listen
const runCLI = () => eureka().listen();

// Export our public functions
module.exports = eureka;
module.exports.runCLI = runCLI;
