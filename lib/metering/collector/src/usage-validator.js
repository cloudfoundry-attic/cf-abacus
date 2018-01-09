'use strict';

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');

const accountCache = require('./cache.js')();

const { extend, pick } = require('underscore');
const util = require('util');

const edebug = require('abacus-debug')('e-abacus-usage-collector-usage-validator');
const debug = require('abacus-debug')('abacus-usage-collector-usage-validator');

const uris = urienv({
  provisioning: 9880,
  account: 9881
});

const brequest = retry(breaker(batch(request)));
const batchedGetRequest = util.promisify(brequest.get);

const validateAccount = async(usage, auth) => {
  const orgId = usage.organization_id;
  const time = usage.end;
  debug('Retrieving account information for org %s', orgId);

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const key = [orgId, t].join('/');

  // Look in our cache first
  const account = accountCache.find(key);
  if (account) {
    debug('Accont information found in the cache');
    return;
  }

  const o = auth ? { headers: { authorization: auth } } : {};

  const res = await batchedGetRequest(
    `${uris.account}/v1/organizations/:org_id/account/:time`,
    extend({}, o, { org_id: orgId, time: time })
  );

  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    throw { badRequest: true, err: `Unable to retrieve account info for ${orgId} at ${time}` };
  }

  accountCache.cache(key, pick(res.body, 'account_id', 'pricing_country'));
};


const validatePlan = async(usage, auth) => {
  // Forward authorization header field to provisioning
  const o = auth ? { headers: { authorization: auth } } : {};

  // Validate the given org/space/consumer/resource/resource_instance
  const res = await batchedGetRequest(
    `${uris.provisioning}/v1/provisioning/organizations/:organization_id/spaces/:space_id/consumers/:consumer_id/` +
    'resources/:resource_id/plans/:plan_id/instances/:resource_instance_id/:time',
    extend({}, o, usage, {
      consumer_id: usage.consumer_id || 'UNKNOWN',
      time: usage.end
    }));

  if (res.statusCode !== 200) {
    const sanitizedResponse = pick(res, 'statusCode', 'headers', 'body');
    edebug('Usage validation failed, %o', sanitizedResponse);
    throw { badRequest: true, err: 'Invalid plan' };
  }
};

const validateSchema = (usage) => {
  try {
    schemas.resourceUsage.validate(usage);
  } catch (err) {
    edebug('Schema validation failed, %o', err);
    throw { badRequest: true, err: 'Invalid schema' };
  }
};

module.exports.validatePlan = validatePlan;
module.exports.validateSchema = validateSchema;
module.exports.validateAccount = validateAccount;
