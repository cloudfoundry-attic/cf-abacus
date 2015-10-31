'use strict';

// A simple Netflix Eureka client.

const request = require('abacus-request');
const perf = require('abacus-perf');
const urienv = require('abacus-urienv');

// Setup debug log
const debug = require('abacus-debug')('abacus-eureka');

// Return an Express middleware that responds to a health check request
const health = () => {
  return function(req, res, next) {
    if(req.path == '/healthcheck') {

      // Get the health of the app computed from the perf stats
      const h = perf.healthy();
      debug('Returning app health %s', h);
      res.status(h ? 200 : 500).send({
        healthy: h
      });
    }
    else
      next();
  };
};

// Return the Eureka v2 API URL. Can be configured with a EUREKA env variable
// and default to http://localhost:8080.
const uris = urienv({
  eureka: 9990
});

const server = (host) => {
  const s = host ? host : process.env.EUREKA ? uris.eureka : undefined;
  return s ? s + '/eureka/v2' : undefined;
};

// Register an app instance
const register = (server, app, iid, uri, port, cb) => {
  debug('Registering app %s instance %s uri %s port %s',
    app, iid, uri, port);

  // Try to register every 5 seconds until it succeeds
  const retry = setInterval(() => {
    request.post(server + '/apps/:app', {
      app: app.toUpperCase(),
      body: {
        instance: {
          dataCenterInfo: {
            name: 'MyOwn'
          },
          app: app.toUpperCase(),
          hostName: [app, iid].join('.'),
          ipAddr: uri,
          vipAddress: uri,
          port: port,
          status: 'UP'
        }
      }
    }, (err, val) => {
      if(err) {
        // Couldn't register, retry in the next interval
        debug('Couldn\'t register app %s instance %s uri %s port %s, %o',
          app, iid, uri, port, err);
        return;
      }

      // Was able to register, stop and call back
      debug('Registered app %s instance %s uri %s port %s',
        app, iid, uri, port);
      clearInterval(retry);
      cb(err, undefined);
    });
  }, 5000);

  // Make sure the interval doesn't prevent the process to end
  retry.unref();
};

// Deregister an app instance
const deregister = (server, app, iid, cb) => {
  debug('Deregistering app %s instance', app, iid);
  request.delete(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: [app, iid].join('.')
  }, (err, val) => {
    if(err)
      debug('Couldn\'t deregister app %s instance %s, %o',
        app, iid, err);
    else
      debug('Deregistered app %s instance %s',
        app, iid);
    cb(err, undefined);
  });
};

// Return info about an app instance
const instance = (server, app, iid, cb) => {
  debug('Looking up app %s instance', app, iid);
  request.get(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: [app, iid].join('.')
  }, (err, val) => {
    if(err) {
      debug('Error looking up app %s instance, %o', app, iid, err);
      return cb(err);
    }
    if(val.statusCode !== 200 || !val.body) {
      debug('App %s instance %s not found', app, iid);
      return cb(undefined, undefined);
    }

    debug('Found app %s instance %s info %o', app, iid, val.body);
    const idoc = val.body.instance;
    return cb(undefined, {
      app: idoc.app,
      instance: idoc.hostName,
      address: idoc.ipAddr,
      port: parseInt(idoc.port.$)
    });
  });
};

// Send a heartbeat
const heartbeat = (server, app, iid, cb) => {
  request.put(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: [app, iid].join('.')
  }, (err, val) => err ? cb(err) : cb(undefined, undefined));
};

// Export our public functions
module.exports = server;
module.exports.server = server;
module.exports.health = health;
module.exports.register = register;
module.exports.deregister = deregister;
module.exports.instance = instance;
module.exports.heartbeat = heartbeat;

