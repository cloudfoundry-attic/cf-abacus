'use strict';

const _ = require('underscore');
const extend = _.extend;
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const map = _.map;

const mockRequestModule = () => {
  const getspy = (reqs, cb) => {

    expect(reqs[0][0]).to.equal(
      'http://localhost:9881/v1/organizations/:org_id/account/:time');

    cb(undefined, map(reqs, (req) => [undefined, {
      statusCode:
        /unauthorized/.test(req[1].org_id || req[1].account_id) ? 401 :
        /unexisting/.test(req[1].org_id) ? 404 :
        200
    }]));
  };
  const reqmock = extend({}, request, {
    batch_get: (reqs, cb) => getspy(reqs, cb)
  });
  require.cache[require.resolve('abacus-request')].exports = reqmock;
};

const mockClusterModule = () => {
  require.cache[require.resolve('abacus-cluster')].exports =
    extend((app) => app, cluster);
};

const mockOAuthModule = () => {
  const validatorspy = spy((req, res, next) => next());
  const cachespy = spy(() => {
    const f = () => undefined;
    f.start = () => undefined;
    return f;
  });
  const authorizespy = spy((auth, escope) => {});
  const scopesspy = spy((token) => {
    return { readResourceScopes : [],hasSystemReadScope : true };
  });
  const oauthmock = extend({}, oauth, {
    validator: () => validatorspy,
    cache: () => cachespy(),
    authorize: () => authorizespy(),
    parseTokenScope: () => scopesspy()
  });
  require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

  return {
    validatorspy: validatorspy
  };
};

module.exports = {
  mockRequestModule: mockRequestModule,
  mockClusterModule: mockClusterModule,
  mockOAuthModule: mockOAuthModule
};
