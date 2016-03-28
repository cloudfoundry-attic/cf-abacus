'use strict';

// A simple Netflix Eureka client.

const request = require('abacus-request');
const perf = require('abacus-perf');
const urienv = require('abacus-urienv');
const oauth = require('abacus-oauth');

const secured = () => process.env.SECURED === 'true' ? true : false;

// Setup debug log
const debug = require('abacus-debug')('abacus-eureka');

// Return the Eureka v2 API URL. Can be configured with a EUREKA env variable
// and default to http://localhost:8080.
const uris = urienv({
  eureka: 9990,
  auth_server: 9882
});

// Return Oauth system scopes needed to read system status
const rscope = () => secured() ? {
  system: ['abacus.system.read']
} : undefined;

// Return an Express middleware that responds to a health check request
const health = () => {
  return function(req, res, next) {
    if(req.path == '/healthcheck') {
      const healthStatus = () => {
        // Get the health of the app computed from the perf stats
        const h = perf.healthy();
        debug('Returning app health %s', h);
        res.status(h ? 200 : 500).send({
          healthy: h
        });
      };

      if(secured()) {
        // Get basic token
        const auth = req.headers && req.headers.authorization;
        // Extracts username and password
        const user = oauth.decodeBasicToken(auth);
        // Get bearer token from UAA to get the credentials
        oauth.getBearerToken(uris.auth_server, user[0],
          user[1], 'abacus.system.read', (err, token) => {
            if(err)
              throw err;
            oauth.authorize(token, rscope());
            healthStatus();
          });
      }
      else
        healthStatus();
    }
    else
      next();
  };
};

const server = (host) => {
  const s = host ? host : process.env.EUREKA ? uris.eureka : undefined;
  return s ? s + '/eureka/v2' : undefined;
};

// Register an app instance
const register = (server, app, appindex, iindex, uri, port, cb) => {
  debug('Registering app %s %s instance %s uri %s port %s',
    app, appindex, iindex, uri, port);

  // Try to register every 5 seconds until it succeeds
  const retry = setInterval(() => {
    request.post(server + '/apps/:app', {
      app: app.toUpperCase(),
      body: {
        instance: {
          dataCenterInfo: {
            '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
            name: 'MyOwn'
          },
          app: app.toUpperCase(),
          asgName: app.toUpperCase(),
          hostName: uri,
          ipAddr: uri,
          vipAddress: uri,
          port: {
            $: port,
            '@enabled': true
          },
          metadata: {
            port: port
          },
          status: 'UP'
        }
      }
    }, (err, val) => {
      if(err) {
        // Couldn't register, retry in the next interval
        debug('Couldn\'t register app %s %s instance %s uri %s port %s, %o',
          app, appindex, iindex, uri, port, err);
        return;
      }

      // Was able to register, stop and call back
      debug('Registered app %s %s instance %s uri %s port %s',
        app, appindex, iindex, uri, port);
      clearInterval(retry);
      cb(err, undefined);
    });
  }, 5000);

  // Make sure the interval doesn't prevent the process to end
  retry.unref();
};

// Deregister an app instance
const deregister = (server, app, appindex, iindex, cb) => {
  debug('Deregistering app %s %s instance', app, appindex, iindex);
  request.delete(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: [[app, appindex].join('-'), iindex].join('.')
  }, (err, val) => {
    if(err)
      debug('Couldn\'t deregister app %s %s instance %s, %o',
        app, appindex, iindex, err);
    else
      debug('Deregistered app %s %s instance %s',
        app, appindex, iindex);
    cb(err, undefined);
  });
};

// Return info about an app instance
const instance = (server, app, appindex, iindex, cb) => {
  debug('Looking up app %s %s instance %s', app, appindex, iindex);
  request.get(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: [[app, appindex].join('-'), iindex].join('.')
  }, (err, val) => {
    if(err) {
      debug('Error looking up app %s %s instance %s, %o',
        app, appindex, iindex, err);
      return cb(err);
    }
    if(val.statusCode !== 200 || !val.body) {
      debug('App %s %s instance %s not found', app, appindex, iindex);
      return cb(undefined, undefined);
    }

    debug('Found app %s %s instance %s info %o',
      app, appindex, iindex, val.body);
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
const heartbeat = (server, app, appindex, iindex, cb) => {
  request.put(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: [[app, appindex].join('-'), iindex].join('.')
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

