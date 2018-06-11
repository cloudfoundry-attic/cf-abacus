'use strict';

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const urienv = require('abacus-urienv');

const accountCache = require('./lib/cache.js')();

const { extend, pick } = require('underscore');
const util = require('util');

const edebug = require('abacus-debug')('e-abacus-accountclient');
const debug = require('abacus-debug')('abacus-accountclient');

const uris = urienv({
  account: 9881
});

const brequest = retry(breaker(batch(request)));
const batchedGetRequest = util.promisify(brequest.get);

const throwValidationError = (res, errorTextNotFound, errorTextDown) => {
  const planNotFound = res.body && res.body.notfound === true || false;
  if (res.statusCode === 404)
    throw { badRequest: planNotFound, error: errorTextNotFound };
  throw { badRequest: false, error: errorTextDown };
};

const getAccount = async(usage, auth) => {
  const orgId = usage.organization_id;
  const time = usage.end;
  debug('Retrieving account information for org %s', orgId);

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const key = [orgId, t].join('/');

  // Look in our cache first
  const account = accountCache.find(key);
  if (account) {
    debug('Account information found in the cache');
    return account;
  }
  const o = auth ? { headers: { authorization: auth } } : {};
  const res = await batchedGetRequest(
    `${uris.account}/v1/organizations/:org_id/account/:time`,
    extend({}, o, { org_id: orgId, time: time })
  );

  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    throwValidationError(res, `Unable to retrieve account info for ${orgId} at ${time}`,
      'Account service not available');
  }
  return accountCache.cache(key, pick(res.body, 'account_id', 'pricing_country', 'license_type'));
};

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
