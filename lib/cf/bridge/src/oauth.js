'use strict';

const request = require('abacus-request');
const urienv = require('abacus-urienv');

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge-oauth');

// Resolve service URIs
const uris = urienv({
  uaa: 443
});

const credentials = {
  clientId: null,
  secret: null
};

// TODO: Replace with or add to existing cfoauth
const obtainToken = () => {
  request.get(':uaa/oauth/token?grant_type=client_credentials', {
    uaa: uris.uaa,
    auth: {
      user: credentials.clientId,
      password: credentials.secret
    }
  }, (error, response) => {
    if (error || response.statusCode !== 200) {
      debug('Cannot obtain token from %s; error %s; response code %s',
        uris.uaa, error, response ? response.statusCode : 'unknown');
      module.tokenRefresher = setTimeout(obtainToken, 3000);
      return;
    }

    debug('Token refreshed successfully');
    module.token = response.body.token_type + ' ' +
      response.body.access_token;
    const timeout = Math.max(response.body.expires_in - 15000, 0);
    debug('Token will be refreshed in %dms', timeout);
    module.tokenRefresher = setTimeout(obtainToken, timeout);
  });
};

const getToken = () => {
  return module.token;
};

const start = (clientId, secret) => {
  if (!clientId || !secret)
    throw new Error('Missing credentials');

  if (module.tokenRefresher)
    throw new Error('Already started');

  credentials.clientId = clientId;
  credentials.secret = secret;
  debug('Starting obtain token loop ...');
  module.tokenRefresher = setTimeout(obtainToken, 0);
};

const stop = () => {
  clearTimeout(module.tokenRefresher);
};

// Export our public functions
module.exports.start = start;
module.exports.getToken = getToken;
module.exports.stop = stop;
