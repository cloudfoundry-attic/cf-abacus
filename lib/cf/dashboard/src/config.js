'use strict';

const _ = require('underscore');
const memoize = _.memoize;

const urienv = require('abacus-urienv');

const dbalias = process.env.DBALIAS || 'db';
const uris = memoize(() => urienv({
  api: 9882,
  auth_server: 9883,
  provisioning: 9880,
  [dbalias]: 5984
}));

const loadCloudFoundryConfig = () => {
  let apiEndpoint = process.env.API;
  const clientId = process.env.CF_CLIENT_ID;
  const clientSecret = process.env.CF_CLIENT_SECRET || '';
  const callbackUrl = process.env.CF_CALLBACK_URL;
  const cookieSecret = process.env.CF_COOKIE_SECRET;
  const abacusProvisioningPlugin = process.env.PROVISIONING;
  const authEndpoint = process.env.AUTH_SERVER;
  const authorizationUrl = `${authEndpoint}/oauth/authorize`;
  const tokenUrl = `${authEndpoint}/oauth/token`;
  const autoRemoveInterval = process.env.AUTO_REMOVE_INTERVAL || 10;

  return {
    'cf_api_endpoint': apiEndpoint,
    'client_id': clientId,
    'client_secret': clientSecret,
    'callback_url': callbackUrl,
    'cookie_secret': cookieSecret,
    'abacus_provisioning_plugin': abacusProvisioningPlugin,
    'authorize_url': authorizationUrl,
    'token_url': tokenUrl,
    'auto_remove_interval': autoRemoveInterval
  };
};

const loadConfig = () => {
  let config = {};
  config.cf = loadCloudFoundryConfig();
  config.trust_proxy = process.env.TRUST_PROXY || true;
  return config;
};

const config = loadConfig();
module.exports = config;
module.exports.uris = uris;
