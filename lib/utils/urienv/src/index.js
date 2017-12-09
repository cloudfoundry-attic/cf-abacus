'use strict';

// Small utility that resolves URIs using the application environment. On
// CloudFoundry URIs are resolved using the route URI from the
// VCAP_APPLICATION env variable.

const _ = require('underscore');
const vcapenv = require('abacus-vcapenv');

const object = _.object;
const map = _.map;
const keys = _.keys;
const some = _.some;

// Setup debug log
const debug = require('abacus-debug')('abacus-urienv');

// Return the default protocol to use
const defprotocol = () => process.browser ? window.location.protocol : 'http:';

// Return the default host to use
const defhost = () => process.browser ? window.location.hostname : 'localhost';

// Return the default port to use
const defport = () => process.browser ? window.location.port : process.env.PORT ? process.env.PORT : 9080;

// Convert an alias to a value found in an environment variable
const env = (alias) => {
  const value = process.env[alias.replace('-', '_').toUpperCase()];
  return value && value.includes('|') ? value.split('|') : value;
};

// Compute URLs in a hosted Cloud platform environment, using the
// bound service instance URIs.
const serviceInstanceURIs = (alias) => {
  const serviceURIs = vcapenv.serviceInstancesCredentials(alias, 'uri');
  if (serviceURIs.every((serviceURI) => /:/.test(serviceURI))) {
    debug('Resolved %s to service instance URIs %o', alias, serviceURIs);
    return serviceURIs;
  }

  return [];
};

const validDomain = (primaryDomain, uris) => {
  return some(uris, (uri) => {
    return uri.includes(primaryDomain);
  });
};

const domain = (uris) => {
  const primaryDomain = process.env.PRIMARY_DOMAIN;

  const domain =
    primaryDomain && validDomain(primaryDomain, uris)
      ? primaryDomain
      : uris[0].split('.').slice(1).join('.');

  debug('Using domain: %s', domain);
  return domain;
};

// Compute the URL of an app in a hosted Cloud platform environment, using
// the app name and the given platform domain URI.
const hosted = (alias, uris) => {
  // Search for service instance
  if (vcapenv.services()) {
    debug('Searching in service instances %j', vcapenv.services());
    const serviceURIs = serviceInstanceURIs(alias);
    if (serviceURIs && serviceURIs.length > 0) return serviceURIs;
  }

  // Use the app environment
  const resolved = env(alias) || alias;
  if (Array.isArray(resolved) && resolved.every((r) => /:/.test(r))) {
    debug('Resolved env alias %s to URIs %o', alias, resolved);
    return resolved;
  }
  if (/:/.test(resolved)) {
    debug('Resolved env alias %s to URI %s', alias, resolved);
    return resolved;
  }

  const target = 'https:' + '//' + resolved + '.' + domain(uris);
  debug('Resolved app route %s to %s', alias, target);
  return target;
};

// Compute the URL of an app in a local environment, using a default protocol,
// host and the given port.
/* eslint complexity: 0 */
const local = (alias, def) => {
  // Use the app environment or the provided default
  const resolved = env(alias) || def;
  if (resolved) {
    if (Array.isArray(resolved)) {
      if (resolved.every((r) => /^[0-9]+$/.test(r))) {
        const target = resolved.map((r) => defprotocol() + '//' + defhost() + ':' + r);
        debug('Resolved alias %s to ports %o', alias, target);
        return target;
      }
      debug('Resolved alias %s to URIs %o', alias, resolved);
      return resolved;
    }
    if (/^[0-9]+$/.test(resolved)) {
      const target = defprotocol() + '//' + defhost() + ':' + resolved;
      debug('Resolved alias %s to port %s', alias, target);
      return target;
    }
    debug('Resolved alias %s to URI %s', alias, resolved);
    return resolved;
  }

  // Use default values
  const target = defprotocol() + '//' + defhost() + (defport() !== '' ? ':' + defport() : '');
  debug('Resolved alias %s to default %s', alias, target);
  return target;
};

// Compute the URL of an app, use like this: resolve.url('abc',
// 'http://localhost:1234') will return 'http://abc.bluemix.net' in an app
// mapped to 'xyz.bluemix.net' and 'http://localhost:1234' otherwise
const url = (alias, def) => {
  // In a Cloud Foundry env, compute the URL using the application URI
  const uris = (vcapenv.app() || {}).application_uris;
  if (uris !== undefined && uris.length) return hosted(alias, uris);

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
