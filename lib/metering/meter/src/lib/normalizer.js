'use strict';

const extend = require('underscore').extend;

class Normalizer {

  constructor(provisioningPluginClient, accountPluginClient) {
    this.provisioningPluginClient = provisioningPluginClient;
    this.accountPluginClient = accountPluginClient;
  }

  async normalizeUsage(doc) {
    const resourceType = await this.provisioningPluginClient.getResourceType(doc.resource_id);
    const account = await this.accountPluginClient.getAccount(doc);

    const meteringPlan = await this.accountPluginClient.getMeteringId(
      doc.organization_id, resourceType, doc.plan_id, doc.end);
    // if(meteringPlan.error)
    //   throw meteringPlan.error;

    const ratingPlan = await this.accountPluginClient.getRatingId(
      doc.organization_id, resourceType, doc.plan_id, doc.end);
    // if(ratingPlan.error)
    //   throw ratingPlan.error;

    const pricingPlan = await this.accountPluginClient.getPricingId(
      doc.organization_id, resourceType, doc.plan_id, doc.end);
    // if(pricingPlan.error)
    //   throw pricingPlan.error;

    const prices = await this.provisioningPluginClient.getPricingPlan(
      pricingPlan.pricing_plan_id, account.pricing_country);
    // if(prices.error)
    //   throw prices.error;

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
