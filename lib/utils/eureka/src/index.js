'use strict';

// A simple Netflix Eureka client.

const _ = require('underscore');
const pick = _.pick;

const request = require('abacus-request');
const urienv = require('abacus-urienv');

const debug = require('abacus-debug')('abacus-eureka');
const edebug = require('abacus-debug')('e-abacus-eureka');

const uris = urienv({
  eureka: 9990
});

const server = (host) => {
  const s = host ? host : uris.eureka;
  return `${s}/eureka/v2`;
};

const secured = process.env.SECURED === 'true';

const authentication = () => secured ? {
  user: process.env.EUREKA_USER,
  password: process.env.EUREKA_PASSWORD
} : undefined;

const sanitizeResponse = (response) => pick(response, 'body', 'statusCode');

const register = (server, app, port, uri, cb) => {
  debug(`Registering app ${app} port ${port} uri ${uri}`);

  // Try to register every 5 seconds until it succeeds
  const retry = setInterval(() => {
    request.post(server + '/apps/:app', {
      app: app.toUpperCase(),
      auth: authentication(),
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
    }, (err, response) => {
      if(err || response && response.statusCode !== 204) {
        edebug(`Couldn't register app ${app} port ${port} uri ${uri} , %o %o`,
          err, sanitizeResponse(response));
        return;
      }

      debug(`Registered app ${app} port ${port} uri ${uri}`);
      clearInterval(retry);
      cb(err, response);
    });
  }, process.env.EUREKA_REGISTER_INTERVAL || 5000);

  // Make sure the interval doesn't prevent the process to end
  retry.unref();
};

const deregister = (server, app, uri, cb) => {
  debug(`Deregistering app ${app} uri ${uri}`);
  request.delete(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: uri,
    auth: authentication()
  }, (err, val) => {
    if(err || val && val.statusCode !== 200)
      edebug(`Couldn't deregister app ${app} uri ${uri} %o`, err);
    else
      debug(`Deregistered app ${app} uri ${uri}`);
    cb(err, val);
  });
};

const instance = (server, app, uri, cb) => {
  debug(`Looking up app ${app} uri ${uri}`);
  request.get(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: uri,
    auth: authentication()
  }, (err, val) => {
    if(err) {
      edebug(`Error looking up app ${app} uri ${uri}, %o`, err);
      return cb(err);
    }
    if(val.statusCode !== 200 || !val.body) {
      edebug(`App ${app} uri ${uri} not found`);
      return cb();
    }

    debug(`Found app ${app} uri ${uri} info %o`, sanitizeResponse(val));
    const idoc = val.body.instance;
    return cb(undefined, {
      app: idoc.app,
      instance: idoc.hostName,
      address: idoc.ipAddr,
      port: parseInt(idoc.port.$)
    });
  });
};

const heartbeat = (server, app, uri, cb) => {
  request.put(server + '/apps/:app/:instance', {
    app: app.toUpperCase(),
    instance: uri,
    auth: authentication()
  }, (err, val) => err ? cb(err) : cb());
};

module.exports = server;
module.exports.server = server;
module.exports.register = register;
module.exports.deregister = deregister;
module.exports.instance = instance;
module.exports.heartbeat = heartbeat;
