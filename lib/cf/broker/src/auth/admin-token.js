'use strict';

const oauth = require('abacus-oauth');
const config = require('../config.js');

const token = oauth.cache(config.uris().api,
  process.env.SERVICE_BROKER_CLIENT_ID,
  process.env.SERVICE_BROKER_CLIENT_SECRET,
  'clients.admin');

const init = (callback) => {
  token.start(
    (err) => err ? callback(err) : callback(undefined, 'successfully fetched'),
  );
};

const authHeader = () => {
  const encodedToken = token();
  return encodedToken ? { authorization: encodedToken } : undefined;
};

module.exports.init = init;
module.exports.authHeader = authHeader;
