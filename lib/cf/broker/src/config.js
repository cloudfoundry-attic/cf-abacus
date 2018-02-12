'use strict';

const _ = require('underscore');
const memoize = _.memoize;
const isEmpty = _.isEmpty;
const isArray = _.isArray;
const map = _.map;

const urienv = require('abacus-urienv');

const samplePricingPlan = require('./plans/pricing.js');

const uris = memoize(() => urienv({
  api : 9882,
  auth_server: 9883,
  provisioning: 9880,
  collector: 9080
}));

const defaultUsageCollectorPath = '/v1/metering/collected/usage';

const usageCollectorPath = process.env.USAGE_COLLECTOR_PATH || defaultUsageCollectorPath;

const defaultResourceProviderPrefix = 'abacus-rp-';
const prefixWithResourceProvider = (id = '') => `${defaultResourceProviderPrefix}${id}`;

const defaultPlanName = 'standard';

const getClientId = (instanceId, bindingId) => {
  const id = `${instanceId}-${bindingId}`;
  return prefixWithResourceProvider(id);
};

const generatePlanId = (resourceProviderId, planId) => `${resourceProviderId}-${planId}`;

const getMappingApi = () => process.env.MAPPING_API || uris().provisioning;

const dashboardUri = process.env.DASHBOARD_URI || '';
const dashboardUrl = (instanceId = '') => dashboardUri.endsWith('/') ?
  `${dashboardUri}${instanceId}` : `${dashboardUri}/${instanceId}`;

const isServiceConfigValid = (serviceConfig) => {
  if(serviceConfig === undefined)
    return true;

  if(isEmpty(serviceConfig))
    return false;

  const plans = serviceConfig.plans;
  return !isEmpty(plans) && isArray(plans) && !isEmpty(plans[0].plan);
};

const defaultPrices = samplePricingPlan().metrics[0].prices;

const buildPricingPlanMetrics = (metrics) =>
  map(metrics, (metric) => ({
    name: metric.name,
    prices: defaultPrices
  }));

const buildRatingPlanMetrics = (metrics) =>
  map(metrics, (metric) => ({
    name: metric.name
  }));

module.exports.uris = uris;
module.exports.prefixWithResourceProvider = prefixWithResourceProvider;
module.exports.defaultResourceProviderPrefix = defaultResourceProviderPrefix;
module.exports.usageCollectorPath = usageCollectorPath;
module.exports.defaultUsageCollectorPath = defaultUsageCollectorPath;
module.exports.defaultPlanName = defaultPlanName;
module.exports.getClientId = getClientId;
module.exports.getMappingApi = getMappingApi;
module.exports.generatePlanId = generatePlanId;
module.exports.dashboardUrl = dashboardUrl;
module.exports.isServiceConfigValid = isServiceConfigValid;
module.exports.buildPricingPlanMetrics = buildPricingPlanMetrics;
module.exports.buildRatingPlanMetrics = buildRatingPlanMetrics;
