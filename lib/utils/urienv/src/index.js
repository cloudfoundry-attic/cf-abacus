'use strict';

// Small utility that resolves URIs using the application environment. On
// CloudFoundry URIs are resolved using the route URI from the VCAP_APPLICATION
// env variable.

const _ = require('underscore');
const vcap = require('abacus-vcapenv');

const object = _.object;
const map = _.map;
const keys = _.keys;

// Setup debug log
const debug = require('abacus-debug')('abacus-urienv');

// Return the default protocol to use
const defprotocol = () => process.browser ? window.location.protocol : 'http:';

// Return the default host to use
const defhost = () => process.browser ? window.location.hostname : 'localhost';

// Return the default port to use
const defport = () => process.browser ?
  window.location.port : process.env.PORT ? process.env.PORT : 9080;

// Convert an alias to a value found in an environment variable
const env = (alias) => process.env[alias.replace('-', '_').toUpperCase()];

// Compute URL in a hosted Cloud platform environment, using the
// bound service instance URIs.
const serviceInstanceURI = (alias) => {
  const serviceURI = vcap.serviceInstanceCredentials(alias, 'uri');
  if (/:/.test(serviceURI)) {
    debug('Resolved %s to service instance URI %s', alias, serviceURI);
    return serviceURI;
  }

  return undefined;
};

// Compute the URL of an app in a hosted Cloud platform environment, using
// the app name and the given platform domain URI.
const hosted = (alias, def, uris) => {
  // Search for service instance
  if(vcap.services()) {
    debug('Searching in service instances %j', vcap.services());
    const serviceURI = serviceInstanceURI(alias);
    if (serviceURI) return serviceURI;
  }

  // Use the app environment
  const resolved = env(alias) || alias;
  if(/:/.test(resolved)) {
    debug('Resolved env %s %s to %s', alias, def, resolved);
    return resolved;
  }

  // Use the given domain URI
  const target =
    'https:' + '//' + resolved + '.' + uris[0].split('.').slice(1).join('.');
  debug('Resolved app route %s %s to %s', alias, def, target);
  return target;
};

// Compute the URL of an app in a local environment, using a default protocol,
// host and the given port.
const local = (alias, def) => {
  // Use the app environment
  const e = env(alias);
  if(e) {
    debug('Resolved env %s %s to %s', alias, def, e);
    return e;
  }

  // Use default values
  const target =
    typeof def === 'number' ? defprotocol() + '//' + defhost() + ':' + def :
    def || defprotocol() + '//' + defhost() + (defport() !== '' ? ':' +
    defport() : '');
  debug('Resolved local %s %s to %s', alias, def, target);
  return target;
};

// Compute the URL of an app, use like this: resolve.url('abc',
// 'http://localhost:1234') will return 'http://abc.bluemix.net' in an app
// mapped to 'xyz.bluemix.net' and 'http://localhost:1234' otherwise
const url = (alias, def) => {
  // In a Cloud Foundry env, compute the URL using the application URI
  const uris = (vcap.env() || {}).application_uris;
  if(uris !== undefined && uris.length)
    return hosted(alias, def, uris);

  // In a local env, compute the URL using defaults
  return local(alias, def);
};

// Compute the URLs of a collection of apps, use like this: resolve({ abc:
// 'http://localhost:1234', def: 4567, ghi: undefined })
// will return { abc: 'http://abc.bluemix.net', def: 'http://def.bluemix.net',
// ghi: 'http://ghi.bluemix.net' } in an app mapped to 'xyz.bluemix.net' and
// { abc: 'http://localhost:1234', def: 'http://localhost:4567', ghi:
// 'http://localhost:8080' } otherwise
const resolve = (apps) => object(map(keys(apps), (k) => [k, url(k, apps[k])]));

// Export our public functions
module.exports = resolve;
module.exports.resolve = resolve;
module.exports.url = url;

