'use strict';

const util = require('util');
const oauth = require('abacus-oauth');

const createSecuredProvider = async ({ uaaUrl, clientId, clientSecret, scopes }) => {
  const systemToken = oauth.cache(uaaUrl, clientId, clientSecret, scopes);
  const startToken = util.promisify(systemToken.start);
  await startToken();

  return {
    getHeader: () => systemToken()
  };
};

const createUnsecuredProvider = () => {
  return {
    getHeader: () => undefined
  };
};

const createAuthHeaderProvider = async (secured, opts) => {
  return secured ? await createSecuredProvider(opts) : createUnsecuredProvider();
};

module.exports = {
  createAuthHeaderProvider
};

