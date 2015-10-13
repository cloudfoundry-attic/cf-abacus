'use strict';

// CloudFoundry environment and app instance utilities. Includes an Express
// middleware that returns the CloudFoundry app instance id.

const _ = require('underscore');

const memoize = _.memoize;
const findWhere = _.findWhere;

// Setup debug log
const debug = require('abacus-debug')('abacus-vcapenv');

// Return the VCAP app config from the VCAP_APPLICATION env variable
const env = memoize(() => {
  return process.env.VCAP_APPLICATION ?
    JSON.parse(process.env.VCAP_APPLICATION) : undefined;
}, () => {
  return process.env.VCAP_APPLICATION || '';
});

// Return the VCAP service instances from the VCAP_SERVICES env variable
const services = memoize(() => {
  return process.env.VCAP_SERVICES ?
    JSON.parse(process.env.VCAP_SERVICES) : undefined;
}, () => {
  return process.env.VCAP_SERVICES || '';
});

// Return the current app instance id
const iid = () => (env() || {}).instance_id ? env().instance_id.toString() :
    process.pid.toString();

// Return the current app index
const iindex = () => (env() || {}).instance_index ?
    env().instance_index.toString() : '0';

const serviceInstance = (serviceInstanceName) => {
  const serviceList = services() || {};

  for(const serviceName in serviceList) {
    const foundInstance = findWhere(serviceList[serviceName],
      { name: serviceInstanceName });
    if (foundInstance) return foundInstance;
  }

  return undefined;
};

const serviceInstanceCredentials = (serviceInstanceName, key) => {
  const foundInstance = serviceInstance(serviceInstanceName);
  return foundInstance ? foundInstance.credentials[key] : undefined;
};

// Returns an Express middleware that reports the app instance id and index
// in the HTTP response headers
const headers = () => {
  return (req, res, next) => {
    debug('Instance id %s', iid());
    res.header('X-Instance-Id', iid());
    debug('Instance index %s', iindex());
    res.header('X-Instance-Index', iindex());
    next();
  };
};

// Export our public functions
module.exports = env;
module.exports.iid = iid;
module.exports.iindex = iindex;
module.exports.services = services;
module.exports.serviceInstance = serviceInstance;
module.exports.serviceInstanceCredentials = serviceInstanceCredentials;
module.exports.headers = headers;
module.exports.env = env;

