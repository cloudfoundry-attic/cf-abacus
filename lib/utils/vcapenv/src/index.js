'use strict';

// CloudFoundry environment and app instance utilities. Includes an Express
// middleware that returns the CloudFoundry app instance id.

const _ = require('underscore');
const path = require('path');

const memoize = _.memoize;
const findWhere = _.findWhere;

// Setup debug log
const debug = require('abacus-debug')('abacus-vcapenv');

// Return the VCAP app config from the VCAP_APPLICATION env variable
const app = memoize(() => {
  return process.env.VCAP_APPLICATION ?
    JSON.parse(process.env.VCAP_APPLICATION) : undefined;
});

// Return the current app package info
const pkginfo = memoize(() => {
  return require(path.join(process.cwd(), 'package.json'));
});

// Return the current app name
const appname = memoize(() => {
  if(!app()) return process.env.APP_NAME || pkginfo().name;
  const e = /^(.*)-([0-9]+)$/.exec(app().name);
  return e ? e[1] : app().name;
});

// Return the current app version
const appversion = memoize(() => {
  return pkginfo().version;
});

// Return the current app index
const appindex = () => {
  if(!app()) return process.env.APP_INDEX || '0';
  const e = /^(.*)-([0-9]+)$/.exec(app().name);
  return e ? e[2] : '0';
};

// Return the current app instance id
const iid = () => app() ? app().instance_id : process.pid.toString();

// Return the current app instance index
const iindex = () => app() ? app().instance_index.toString() : 
  process.env.INSTANCE_INDEX ? process.env.INSTANCE_INDEX : '0';

// Return the current app instance IP address
const iaddress = () => process.env.CF_INSTANCE_IP ||
  process.env.HOST || 'localhost';

// Return the current app instance ports from the CF_INSTANCE_PORTS
const iports = memoize(() => {
  if(!process.env.CF_INSTANCE_PORTS)
    return undefined;
  const p = JSON.parse(process.env.CF_INSTANCE_PORTS);
  return p.length ? p : undefined;
}, () => {
  return process.env.CF_INSTANCE_PORTS || '';
});

// Return the current app instance port
const iport = () => iports() ? iports()[0].external :
  process.env.PORT ? parseInt(process.env.PORT) : undefined;

// Return the VCAP service instances from the VCAP_SERVICES env variable
const services = memoize(() => {
  return process.env.VCAP_SERVICES ?
    JSON.parse(process.env.VCAP_SERVICES) : undefined;
}, () => {
  return process.env.VCAP_SERVICES || '';
});

// Return a VCAP service instance
const serviceInstance = (serviceInstanceName) => {
  const serviceList = services() || {};

  for(const serviceName in serviceList) {
    const foundInstance = findWhere(serviceList[serviceName],
      { name: serviceInstanceName });
    if (foundInstance) return foundInstance;
  }

  return undefined;
};

// Return the credentials configured for a VCAP service instance
const serviceInstanceCredentials = (serviceInstanceName, key) => {
  const foundInstance = serviceInstance(serviceInstanceName);
  return foundInstance ? foundInstance.credentials[key] : undefined;
};

// Returns an Express middleware that reports the app instance id and index
// in the HTTP response headers
const headers = () => {
  return (req, res, next) => {
    debug('App name %s', appname());
    res.header('X-App-Name', appname());
    debug('App version %s', appversion());
    res.header('X-App-Version', appversion());
    debug('App index %s', appindex());
    res.header('X-App-Index', appindex());
    debug('Instance id %s', iid());
    res.header('X-Instance-Id', iid());
    debug('Instance index %s', iindex());
    res.header('X-Instance-Index', iindex());
    next();
  };
};

// Export our public functions
module.exports = app;
module.exports.app = app;
module.exports.appname = appname;
module.exports.appindex = appindex;
module.exports.iid = iid;
module.exports.iindex = iindex;
module.exports.iaddress = iaddress;
module.exports.iports = iports;
module.exports.iport = iport;
module.exports.services = services;
module.exports.serviceInstance = serviceInstance;
module.exports.serviceInstanceCredentials = serviceInstanceCredentials;
module.exports.headers = headers;

