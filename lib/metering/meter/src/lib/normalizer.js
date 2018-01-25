'use strict';

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const util = require('util');
const extend = require('underscore').extend;
const accountClient = require('abacus-accountclient');

const pricingConfig = require('abacus-pricing-config');
const getPricingPlan = util.promisify(pricingConfig.plan);
const getMeteringId = util.promisify(require('abacus-metering-config').id);
const getRatingId = util.promisify(require('abacus-rating-config').id);
const getPricingId = util.promisify(pricingConfig.id);

const edebug = require('abacus-debug')('e-abacus-usage-meter-normalizer');
const debug = require('abacus-debug')('abacus-usage-meter-normalizer');

const uris = urienv({
  provisioning: 9880
});

const brequest = retry(breaker(batch(request)));
const batchedGetRequest = util.promisify(brequest.get);

const getResourceType = async(resourceId, auth) => {
  debug('Retrieving resource type for resource id %s', resourceId);
  const o = auth ? { headers: { authorization: auth } } : {};
  const res = await batchedGetRequest(
    uris.provisioning + '/v1/provisioning/resources/:resource_id/type',
    extend({}, o, {
      cache: true,
      resource_id: resourceId
    })
  );
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve resource type, %o', res);
    debug('Unable to retrieve resource type, %o', res);
    throw { badRequest: false, err: `Unable to retrieve resource type for resource id  ${resourceId}` };
  }
  return res.body;
};

const normalize = async(usageDoc, auth) => {
  const resourceType = await getResourceType(usageDoc, auth);
  const account = await accountClient.getAccount(usageDoc, auth);

  const meteringPlan =
    await getMeteringId(usageDoc.organization_id, resourceType, usageDoc.plan_id, usageDoc.end, auth);
  if(meteringPlan.error)
    throw meteringPlan.error;

  const ratingPlan = await getRatingId(usageDoc.organization_id, resourceType, usageDoc.plan_id, usageDoc.end, auth);
  if(ratingPlan.error)
    throw ratingPlan.error;

  const pricingPlan = await getPricingId(usageDoc.organization_id, resourceType, usageDoc.plan_id, usageDoc.end, auth);
  if(pricingPlan.error)
    throw pricingPlan.error;

  const prices = await getPricingPlan(pricingPlan.pricing_plan_id, account.pricing_country, auth);
  if(prices.error)
    throw prices.error;

  return extend({}, usageDoc, {
    resource_type: resourceType,
    account_id: account.account_id,
    pricing_country: account.pricing_country,
    metering_plan_id: meteringPlan.metering_plan_id,
    rating_plan_id: ratingPlan.rating_plan_id,
    pricing_plan_id: pricingPlan.pricing_plan_id,
    prices: prices.pricing_plan
  });
};

module.exports = normalize;
