'use strict';

const _ = require('underscore');
const memoize = _.memoize;
const isEmpty = _.isEmpty;
const isArray = _.isArray;

const urienv = require('abacus-urienv');

const uris = memoize(() => urienv({
  api : 9882,
  auth_server: 9883,
  provisioning: 9880,
  collector: 9080
}));

const usageCollectorPath = '/v1/metering/collected/usage';

const prefixWithResourceProvider = (id = '') => `abacus-rp-${id}`;

const defaultPlanName = 'standard';

const getClientId = (instanceId, bindingId) => {
  const id = `${instanceId}-${bindingId}`;
  return prefixWithResourceProvider(id);
};

const generatePlanId = (resourceProviderId, planId) => `${resourceProviderId}-${planId}`;

const getMappingApi = () => process.env.MAPPING_API;

const dashboardUri = process.env.DASHBOARD_URI || '';
const dashboardUrl = (instanceId = '') => dashboardUri.endsWith('/') ?
  `${dashboardUri}${instanceId}` : `${dashboardUri}/${instanceId}`;

const isServiceConfigValid = (serviceConfig) => {
  if(isEmpty(serviceConfig))
    return false;

  const plans = serviceConfig.plans;
  return !isEmpty(plans) && isArray(plans) && !isEmpty(plans[0].plan);
};


const getServiceConfiguration = (parameters) => {
  if (isEmpty(parameters.plans) || !isArray(parameters.plans) || isEmpty(parameters.plans[0].plan))
    throw new Error(`Invalid service configuration: ${JSON.stringify(parameters)}`);

  return {
    userProvidedPlan: parameters.plans[0].plan,
    resourceProvider: parameters.plans[0].resource_provider
  };
};

module.exports.uris = uris;
module.exports.prefixWithResourceProvider = prefixWithResourceProvider;
module.exports.usageCollectorPath = usageCollectorPath;
module.exports.defaultPlanName = defaultPlanName;
module.exports.getClientId = getClientId;
module.exports.getMappingApi = getMappingApi;
module.exports.generatePlanId = generatePlanId;
module.exports.dashboardUrl = dashboardUrl;
module.exports.getServiceConfiguration = getServiceConfiguration;
module.exports.isServiceConfigValid = isServiceConfigValid;
