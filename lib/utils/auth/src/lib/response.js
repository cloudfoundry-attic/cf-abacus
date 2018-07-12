'use strict';

const { UNAUTHORIZED } = require('http-status-codes');

/**
 * Writes a 401 unauthorized response to the response object.
 * @param {object} resp the HTTP response object
 * @param {string} errorCode an optional error code (e.g. `invalid_token`)
 * @param {string} errorDescription an optional error description 
 * (e.g. `missing scopes`)
 * @returns {undefined}
 */
const sendUnauthorized = (resp, errorCode, errorDescription) => {
  let msg = 'Bearer realm="cf"';
  if (errorCode)
    msg += `, error="${errorCode}"`;
  if (errorDescription)
    msg += `, error_description="${errorDescription}"`;

  resp.status(UNAUTHORIZED).header('WWW-Authenticate', msg).end();
};

module.exports = {
  sendUnauthorized
};
