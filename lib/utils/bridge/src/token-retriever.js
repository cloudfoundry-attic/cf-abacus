'use strict';

const oauth = require('abacus-oauth');
const retry = require('abacus-retry');
const yieldable = require('abacus-yieldable');

const debug = require('abacus-debug')('abacus-bridge-token-retriever');
const edebug = require('abacus-debug')('e-abacus-bridge-token-retriever');

const createScopesString = (scopes) => {
  return scopes && scopes.length > 0 ? scopes.join(' ') : undefined;
};

const createToken = (opts) => {
  return oauth.cache(opts.authServerURI, opts.clientId, opts.clientSecret, createScopesString(opts.scopes));
};

const debugStart = (opts) => {
  debug(
    'Getting token from "%s" with client_id "%s" and scopes "%j".',
    opts.authServerURI,
    opts.clientId,
    opts.scopes || []
  );
};

const debugStartSuccess = (opts) => {
  debug(
    'Acquired token from "%s" with client_id "%s" and scopes "%j".',
    opts.authServerURI,
    opts.clientId,
    opts.scopes || []
  );
};

const debugStartFailure = (opts, err) => {
  edebug(
    'Failed to acquire token from "%s" with client_id "%s" and scopes "%j": ',
    opts.authServerURI,
    opts.clientId,
    opts.scopes || [],
    err
  );
};

const retrieve = (opts, cb) => {
  debugStart(opts);
  const token = createToken(opts);
  const retryStartToken = retry(token.start, retry.forever);
  retryStartToken((err) => {
    if (!err) debugStartSuccess(opts);
    else debugStartFailure(opts, err);
    cb(err, token);
  });
};

module.exports = yieldable(retrieve);
