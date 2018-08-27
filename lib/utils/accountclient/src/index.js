'use strict';

const { extend, pick } = require('underscore');
const util = require('util');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const lock = require('abacus-lock').locker('accountClient');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const uris = urienv({
  account: 9881
});

const accountCache = require('./lib/cache.js')();

const edebug = require('abacus-debug')('e-abacus-accountclient');
const debug = require('abacus-debug')('abacus-accountclient');

const brequest = retry(breaker(batch(request)));

const buildValidationError = (res, errorTextNotFound, errorTextDown) => {
  const error = new Error(errorTextNotFound);

  if (res.statusCode === 404) {
    error.badRequest = res.body && res.body.notfound === true || false;
    error.error = errorTextNotFound;
  } else {
    error.badRequest = false;
    error.error = errorTextDown;
  }

  return error;
};

const _getAccount = (usage, auth, cb) => {
  const orgId = usage.organization_id;
  const time = usage.end;
  debug('Retrieving account information for org %s', orgId);

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const key = [orgId, t].join('/');

  lock(key, (err, unlock) => {
    if (err) {
      edebug('Error locking account client for account %s: %o', key, err);
      unlock(cb(err));
      return;
    }

    // Look in our cache first
    const account = accountCache.find(key);
    if (account) {
      debug('Account information found in cache');
      unlock(cb(undefined, account));
      return;
    }

    const o = auth ? { headers: { authorization: auth } } : {};
    brequest.get(
      `${uris.account}/v1/organizations/:org_id/account/:time`,
      extend({}, o, { org_id: orgId, time: time }),
      (err, res) => {
        if (err) {
          edebug('Failed to get account %s information: %o', key, err);
          unlock(cb(err));
          return;
        }

        if (res.statusCode !== 200) {
          const msg = `Unable to retrieve account info for ${orgId} at ${time}`;
          edebug(`${msg} : %o`, key, res);
          unlock(cb(buildValidationError(res, msg, 'Account service not available')));
          return;
        }
        unlock(
          cb(
            undefined,
            accountCache.cache(key, pick(res.body, 'account_id', 'pricing_country', 'license_type'))
          )
        );
      }
    );
  });
};

const getAccount = util.promisify(_getAccount);

const validateAccount = async(usage, auth, unsupportedLicenses) => {
  const account = await getAccount(usage, auth);
  debug('Verifying account %j', account);

  if (account.license_type && unsupportedLicenses.includes(account.license_type)) {
    const msg = `Unsupported license type ${account.license_type}`;
    edebug(msg);
    throw extend(new Error(msg), {
      status: 451, // 451 Unavailable For Legal Reasons (RFC 7725)
      error: 'license',
      unsupportedLicense: true,
      reason: msg,
      noretry: true,
      nobreaker: true
    });
  }
};

module.exports.getAccount = getAccount;
module.exports.validateAccount = validateAccount;
