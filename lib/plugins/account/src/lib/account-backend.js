'use strict';

const lru = require('abacus-lrucache');
const lock = require('abacus-lock').locker('accountCache');
const request = require('abacus-request');
const util = require('util');

/* jshint noyield: true */

const debug = require('abacus-debug')('abacus-account-plugin-backend');
const edebug = require('abacus-debug')('e-abacus-account-plugin-backend');

// The example account returned by the plugin
const sampleAccount = {
  account_id: '1234',
  organizations: [ 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27' ],
  pricing_country: 'USA',
  license_type: 'TRIAL'
};

const twelveHoursInMillis = 12 * 60 * 60 * 1000;
const maxAge = process.env.ACCOUNT_CACHE_MAX_AGE ? parseInt(process.env.ACCOUNT_CACHE_MAX_AGE) : twelveHoursInMillis;

const accountsCache = lru({
  max: 100000,
  maxAge: maxAge
});

const authHeader = (token) => (
  { headers: { authorization: token() } }
);

const populateCache = (accounts) => {
  for (let account of accounts)
    if (account.cfOrg)
      accountsCache.set(account.cfOrg, {
        account_id: account.id,
        organizations: [account.cfOrg],
        pricing_country: account.pricing_country || 'USA',
        license_type: account.licenseType || 'TRIAL'
      });
};

const refreshCache = (accountBackend, accountBackendToken, cb) => {
  request.get(accountBackend, authHeader(accountBackendToken), (err, response) => {
    if (err) {
      edebug('Account backend responded with error %o', err);
      return cb(err);
    }
    if (response.statusCode != 200) {
      const msg = util.format('Account backend responded with code %d and body %o', response.statusCode, response.body);
      edebug(msg);
      return cb(msg);
    }

    debug('Account backend returned %d elements', response.body.length);
    populateCache(response.body);

    return cb();
  });
};

const getAccount = (accountBackend, accountBackendToken, orgId, cb) => {
  if (!accountBackend) {
    cb(undefined, sampleAccount);
    return;
  }

  if (!accountBackendToken) {
    cb('Backend token not provided');
    return;
  }

  lock(orgId, (err, unlock) => {
    if (err) {
      edebug('Error locking account cache for %s: %o', key, err);
      unlock(cb(err));
      return;
    }

    let accountInfo = accountsCache.get(orgId);
    if (accountInfo) {
      debug('Org %s found in cache', orgId);
      unlock(cb(undefined, accountInfo));
      return;
    }

    debug('Refreshing account data; org %s not found in cache', orgId);
    refreshCache(accountBackend, accountBackendToken, (err) => {
      if (err) {
        unlock(cb(err));
        return;
      }

      accountInfo = accountsCache.get(orgId);
      debug('Found %o account info for organization %s', accountInfo, orgId);
      unlock(cb(undefined, accountInfo));
    });
  });
};

// Export our public functions
module.exports = (accountBackend, accountBackendToken) =>
  (orgId, cb) => getAccount(accountBackend, accountBackendToken, orgId, cb);

module.exports.sampleAccount = sampleAccount;
