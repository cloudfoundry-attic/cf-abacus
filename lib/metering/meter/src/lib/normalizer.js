'use strict';

const extend = require('underscore').extend;

const debug = require('abacus-debug')('abacus-usage-metering-normalizer');
const edebug = require('abacus-debug')('e-abacus-usage-metering-normalizer');

const validateResponse = (response) => {
  if (response.error) {
    edebug('Response error %j', response);
    throw new Error(response);
  }
  return response;
};

class Normalizer {

  constructor(provisioningPluginClient, accountPluginClient) {
    this.provisioningPluginClient = provisioningPluginClient;
    this.accountPluginClient = accountPluginClient;
  }

  async normalizeUsage(doc) {
    const resourceType = validateResponse(await this.provisioningPluginClient.getResourceType(doc.resource_id));
    debug('Got resource type', resourceType);

    const account = validateResponse(await this.accountPluginClient.getAccount(doc));
    debug('Got account', account);

    const meteringPlan = validateResponse(await this.accountPluginClient.getMeteringId(
      doc.organization_id, resourceType, doc.plan_id, doc.end));
    debug('Got metering plan', meteringPlan);

    const ratingPlan = validateResponse(await this.accountPluginClient.getRatingId(
      doc.organization_id, resourceType, doc.plan_id, doc.end));
    debug('Got rating plan', ratingPlan);

    const pricingPlan = validateResponse(await this.accountPluginClient.getPricingId(
      doc.organization_id, resourceType, doc.plan_id, doc.end));
    debug('Got pricing plan', pricingPlan);

    return extend({}, doc, {
      resource_type: resourceType,
      account_id: account.account_id,
      metering_plan_id: meteringPlan.metering_plan_id,
      rating_plan_id: ratingPlan.rating_plan_id,
      pricing_plan_id: pricingPlan.pricing_plan_id
    });
  }

}

module.exports = Normalizer;
