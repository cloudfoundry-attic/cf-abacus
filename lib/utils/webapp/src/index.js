'use strict';

// Setup of a convenient Express starting point for Webapps.
// Also sets up some call perf metrics collection.

const express = require('abacus-express');
const vcapenv = require('abacus-vcapenv');
const perf = require('abacus-perf');
const hystrix = require('abacus-hystrix');
const eureka = require('abacus-eureka');
const oauth = require('abacus-oauth');
const cp = require('child_process');
const commander = require('commander');
const metrics = require('abacus-metrics');
const router = require('abacus-router');
const { wrap } = require('underscore');
const { OK: STATUS_OK, INTERNAL_SERVER_ERROR: STATUS_INTERNAL_SERVER_ERROR } = require('http-status-codes');

// Setup debug log
const debug = require('abacus-debug')('abacus-webapp');
const edebug = require('abacus-debug')('e-abacus-webapp');

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

// Configure an Express-based Web app
const webapp = () => {
  const appname = vcapenv.appname();
  debug('Creating app %s', appname);

  const app = express();
  app.use(vcapenv.headers());
  app.use('/v1/metrics', createMetricsRoute());

  let healthCheckMiddlware = defaultHealthCheck;

  /**
   * Specifies the healthcheck middleware to use for the
   * healthcheck endpoint.
   * If no middleware is specified or this method is not called, a
   * default one will be used.
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
    debug('Listening');
    const server = listen.call(app, opt, cb);

    // Optionally register the app instance in a Eureka registry
    if (eureka())
      eureka.register(eureka(), appname, vcapenv.iport() || server.address().port, vcapenv.iaddress(), (err, val) => {
        if (err) debug('Couldn\'t register app %s in Eureka registry, %o', appname, err);
        else debug('Registered app %s in Eureka registry', appname);
      });


    if (process.env.CONNECTION_TIMEOUT) {
      const connectionTimeout = parseInt(process.env.CONNECTION_TIMEOUT);
      debug('Setting connection timeout to %d', connectionTimeout);
      server.setTimeout(connectionTimeout);
    }

    process.on('SIGINT', () => {
      edebug('Process %s interrupted', appname);
      setTimeout(() => process.exit(0), 0);
    });
    process.on('SIGTERM', () => {
      debug('Process %s terminated', appname);
      setTimeout(() => process.exit(0), 0);
    });

    return server;
  });

  return app;
};

// Command line interface
const runCLI = () => {
  commander
    .option('start', 'start the server')
    .option('stop', 'stop the server')
    .parse(process.argv);

  const cwd = process.cwd();
  debug('Working directory %s', cwd);

  if (commander.start) {
    const app = require(cwd);
    if (app && app.runCLI) app.runCLI();
  } else if (commander.stop)
    cp.exec(`pkill -f "node ${vcapenv.appname()}-[0-9]+ (master|express)"`, (err, stdout, stderr) => {
      if (err) edebug('Stop error %o', err);
    });
};

module.exports = webapp;
module.exports.runCLI = runCLI;
