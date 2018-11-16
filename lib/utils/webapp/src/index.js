'use strict';

// Setup of a convenient Express starting point for web applications.
// Also sets up some call perf metrics collection.

const { wrap } = require('underscore');

const express = require('abacus-express');
const eureka = require('abacus-eureka');
const hystrix = require('abacus-hystrix');
const oauth = require('abacus-oauth');
const perf = require('abacus-perf');
const metrics = require('abacus-metrics');
const router = require('abacus-router');
const vcapenv = require('abacus-vcapenv');

const { OK: STATUS_OK, INTERNAL_SERVER_ERROR: STATUS_INTERNAL_SERVER_ERROR } = require('http-status-codes');

// Setup debug log
const debug = require('abacus-debug')('abacus-webapp');

const defaultSecurity = () => process.env.SECURED === 'true';
const secured = () => process.env.HEALTHCHECK_SECURED === 'false' ? false : defaultSecurity();

const healthCheckScopes = 'abacus.system.read';
const metricsAuthorizationScopes = ['abacus.system.read'];

const defaultHealthCheck = (req, res) => {
  debug(`Entering ${secured ? 'secured' : ''} healthcheck`);
  const h = perf.healthy();
  debug('Returning app health %s', h);
  res.status(h ? STATUS_OK : STATUS_INTERNAL_SERVER_ERROR).send({
    healthy: h
  });
};

const createMetricsRoute = () => {
  const route = router();
  if (secured())
    route.use(oauth.authorizer(process.env.JWTKEY, process.env.JWTALGO, metricsAuthorizationScopes));
  route.use(metrics.createMiddleware(metrics.defaultCollection));
  return route;
};

const appName = vcapenv.appname();

// Configure an Express-based Web app
const webapp = () => {
  debug('Setting up %s environment', appName);
  process.env.TZ = 'UTC';
  if (!process.env.VCAP_APPLICATION) {
    process.env.PORT = process.env.PORT || process.env.npm_package_config_port;
    process.env.APPS = 1;
    process.env.APP_NAME = appName;
    process.env.APP_INDEX = 0;
    process.env.INSTANCES = 1;
    process.env.INSTANCE_INDEX = 0;
  }

  debug('Creating %s', appName);
  const app = express();
  app.use(vcapenv.headers());
  app.use('/v1/metrics', createMetricsRoute());

  let healthCheckMiddlware = defaultHealthCheck;

  /**
   * Specifies the healthcheck middleware to use for the healthcheck endpoint.
   * If no middleware is specified or this method is not called, a default one will be used.
   *
   * @param {object} middleware middleware object to serve healthcheck calls
   * @returns {undefined}
   */
  app.useHealthCheck = (middleware) => {
    if (middleware) healthCheckMiddlware = middleware;
    else healthCheckMiddlware = defaultHealthCheck;
  };

  // Monkey patch the app listen function to register some of our middleware after the app's middleware
  /* eslint complexity: [1, 7] */
  app.listen = wrap(app.listen, (listen, opt, cb) => {
    if (secured()) {
      app.use(
        '/hystrix.stream',
        oauth.basicStrategy(process.env.API, hystrix.scopes, process.env.JWTKEY, process.env.JWTALGO)
      );

      app.use(
        '/healthcheck',
        oauth.basicStrategy(process.env.API, healthCheckScopes, process.env.JWTKEY, process.env.JWTALGO)
      );
    }

    app.use('/hystrix.stream', hystrix.stream());
    app.get('/healthcheck', healthCheckMiddlware);

    // Call the original app listen function
    debug('Application %s listening', appName);
    const server = listen.call(app, opt, cb);

    // Optionally register the app instance in a Eureka registry
    if (eureka())
      eureka.register(eureka(), appName, vcapenv.iport() || server.address().port, vcapenv.iaddress(), (err, val) => {
        if (err) debug('Couldn\'t register app %s in Eureka registry, %o', appName, err);
        else debug('Registered app %s in Eureka registry', appName);
      });

    if (process.env.CONNECTION_TIMEOUT) {
      const connectionTimeout = parseInt(process.env.CONNECTION_TIMEOUT);
      debug('Setting %s connection timeout to %d', appName, connectionTimeout);
      server.setTimeout(connectionTimeout);
    }

    return server;
  });

  debug('%s started', appName);
  return app;
};

module.exports = webapp;
