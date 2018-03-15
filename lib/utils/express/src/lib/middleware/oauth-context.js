'use strict';

const oauth = require('abacus-oauth');
const httpStatus = require('http-status-codes');

const isBearerRequest = (req) => {
  return req.headers && req.headers.authorization && /^bearer /i.test(req.headers.authorization);
};

const sendUnauthorized = (res, err) => {
  res.status(httpStatus.UNAUTHORIZED).header(
    'WWW-Authenticate',
    'Bearer realm="cf", error="invalid_token", error_description="' + err.message + '"'
  ).end();
};

/**
 * The oauthContext function creates a middleware function that extracts oauth token information,
 * if present, from the request and assigns it to a `context` object on the request object itself.
 * This allows middleware instances down the line to consume that information.
 * If the request is a Bearer one, but the token is invalid, this middleware will return an
 * Unauthorized response and will not delegate the call to further middlewares.
 * @param {string} secret - specifies the public key that was used by the OAuth server to sign the token. This is
 * used to verify the validity of the token.
 * @param {string} algorithm - specifies the algorithm that was used by the OAuth server to sign the token.
 */
const oauthContext = (secret, algorithm) => {
  return (req, res, next) => {
    if (!isBearerRequest(req)) {
      next();
      return;
    }

    const bearerString = req.headers.authorization.replace(/^bearer /i, '');
    oauth.validate(bearerString, secret, algorithm, (err, token) => {
      if (err) {
        sendUnauthorized(res, err);
        return;
      }
      req.context = req.context || {};
      req.context.oauth = {
        scopes: oauth.parseScopes(token.scope)
      };
      next();
    });
  };
};

module.exports = oauthContext;
