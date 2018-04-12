'use strict';

const _ = require('underscore');
const mapObject = _.mapObject;

const oauth = require('abacus-oauth');
const tmap = require('abacus-transform').map;
const debug = require('abacus-debug')('abacus-broker');

const config = require('../config.js');

const CLIENT_REGISTRATION_TOKEN = 'client_registration';
const SYSTEM_TOKEN = 'system';

const tokensToFetch = {
  [SYSTEM_TOKEN]: process.env.SERVICE_BROKER_CLIENT_SCOPES ||
    'abacus.usage.read abacus.usage.write',
  [CLIENT_REGISTRATION_TOKEN]: 'clients.admin'
};

const cachedTokens = mapObject(tokensToFetch, (scopes) =>
  oauth.cache(config.uris().api,
    process.env.SERVICE_BROKER_CLIENT_ID,
    process.env.SERVICE_BROKER_CLIENT_SECRET, scopes));

const init = (callback) => {
  debug('Fetching OAuth system token from server %o', config.uris().api);
  tmap(Object.keys(cachedTokens),
    (tokenKey, index, list, cb) => cachedTokens[tokenKey].start(
      (err) => err ? cb(err) : cb(undefined, 'successfully fetched')),
    callback);
};

const authHeader = (token = SYSTEM_TOKEN) => {
  const encodedToken = cachedTokens[token]();
  return encodedToken ? { authorization: encodedToken } : undefined;
};

module.exports.init = init;
module.exports.authHeader = authHeader;
module.exports.CLIENT_REGISTRATION_TOKEN = CLIENT_REGISTRATION_TOKEN;
module.exports.SYSTEM_TOKEN = SYSTEM_TOKEN;
