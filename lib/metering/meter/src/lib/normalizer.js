'use strict';

const extend = require('underscore').extend;

const debug = require('abacus-debug')('abacus-usage-metering-normalizer');

class Normalizer {

  constructor(provisioningPluginClient, accountPluginClient) {
    this.provisioningPluginClient = provisioningPluginClient;
    this.accountPluginClient = accountPluginClient;
  }

  async normalizeUsage(doc) {

    debug('Normalize started');

    const resourceType = await this.provisioningPluginClient.getResourceType(doc.resource_id);
    debug('Get resource type finished succesfully', resourceType);

    const account = await this.accountPluginClient.getAccount(doc);
    debug('Get account finished succesfully', account);

    const meteringPlan = await this.accountPluginClient.getMeteringId(
      doc.organization_id, resourceType, doc.plan_id, doc.end);
    debug('Get metering plan finished succesfully', meteringPlan);

    const ratingPlan = await this.accountPluginClient.getRatingId(
      doc.organization_id, resourceType, doc.plan_id, doc.end);
    debug('Get rating plan finished succesfully', ratingPlan);

    const pricingPlan = await this.accountPluginClient.getPricingId(
      doc.organization_id, resourceType, doc.plan_id, doc.end);
    debug('Get pricing plan finished succesfully', pricingPlan);

    const prices = await this.provisioningPluginClient.getPricingPlan(
      pricingPlan.pricing_plan_id, account.pricing_country);
    debug('Get prices finished succesfully', prices);

    return extend({}, doc, {
      resource_type: resourceType,
      account_id: account.account_id,
      pricing_country: account.pricing_country,
      metering_plan_id: meteringPlan.metering_plan_id,
      rating_plan_id: ratingPlan.rating_plan_id,
      pricing_plan_id: pricingPlan.pricing_plan_id,
      prices: prices.pricing_plan
    });
  }

};

module.exports = Normalizer;
