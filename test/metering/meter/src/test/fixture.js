'use strict';
const util = require('util');
const { pad16 } = require('abacus-dbcommons')();

const mockServer = require('./mock-server');

const orgId = 'org-id';
const resourceId = 'test-resource';
const planId = 'plan-id';
const resourceType = 'resource-type';
const accountId = 'account-id';
const pricingCountry = 'country';
const defaultMeteringPlanId = 'test-metering-plan';
const defaultRatingPlanId = 'test-rating-plan-id';
const defaultPricingPlanId = 'test-pricing-plan-id';
const defaultPricingPlan = { name: 'storage', price: 1 };
const createAccount = (accountId, pricingCountry, orgId) => ({
  account_id: accountId,
  pricing_country: pricingCountry,
  organization_id: orgId
});


// In order to avoid caching
const unique = (id, timestamp) => id + timestamp;

const createUsageDoc = (config) => ({
  metadata: {
    retryCount: 0
  },
  usageDoc: {
    start: config.time,
    end: config.time,
    processed_id: `${config.time}-0-0-0`,
    organization_id: unique(config.org ? config.org : orgId, config.time),
    space_id: 'space-id',
    consumer_id: 'consumer-id',
    resource_id: config.resource ? config.resource : resourceId + config.time,
    plan_id: config.plan ? config.plan : planId,
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  }
});

const getLocationsUrl = (config) => {
  const key = util.format(
    '%s/%s/%s/%s/%s/%s',
    unique(config.org ? config.org : orgId, config.time),
    'space-id',
    'consumer-id',
    config.resource ? config.resource : resourceId + config.time,
    config.plan ? config.plan : planId,
    '0b39fa70-a65f-4183-bae8-385633ca5c87'
  );
  return `/v1/metering/collected/usage/t/${pad16(config.time)}/k/${key}`;
};

const provPluginResTypeUrl = (resourceId) => `/v1/provisioning/resources/${resourceId}/type`;

const provPluginPricingPlanUrl = (timestamp) => `/v1/pricing/plans/${defaultPricingPlanId}${timestamp}`;
const accountPluginGetAccountUrl = (orgId, time) => `/v1/organizations/${orgId}${time}/account/${time}`;
const accountPluginGetPlanUrl = (type, orgId, planId, time) => `/v1/${type}/organizations/${orgId}${time}` +
`/resource_types/resource-type${time}/plans/${planId}/time/${time}/${type}_plan/id`;
const accumulatorUrl = '/v1/metering/metered/usage';

const buildResponse = (statusCode, body = {}) => ({ statusCode: statusCode, body: body });

const buildStub = (endpoints) => {
  const stub = mockServer.app();

  for(let endpoint of endpoints)
    stub.returns(endpoint.url, endpoint.responses);

  return stub;
};

const buildStubs = (config) => {
  const stubs = {
    provisioning: buildStub(config.provisioning),
    account: buildStub(config.account),
    accumulator: buildStub(config.accumulator)
  };
  return stubs;
};

const provisioningSuccessfulResponses = (timestamp) => [
  {
    url: provPluginResTypeUrl(unique(resourceId, timestamp)),
    responses: [ buildResponse(200, unique(resourceType, timestamp)) ]
  },
  {
    url: provPluginPricingPlanUrl(timestamp),
    responses: [ buildResponse(200, defaultPricingPlan) ]
  }
];


const accountSuccessfulResponses = (timestamp) => [
  {
    url: accountPluginGetAccountUrl(orgId, timestamp),
    responses: [ buildResponse(200, createAccount(accountId, pricingCountry, orgId)) ]
  },
  {
    url: accountPluginGetPlanUrl('metering', orgId, planId, timestamp),
    responses: [ buildResponse(200, defaultMeteringPlanId) ]
  },
  {
    url: accountPluginGetPlanUrl('rating', orgId, planId, timestamp),
    responses: [ buildResponse(200, defaultRatingPlanId) ]
  },
  {
    url: accountPluginGetPlanUrl('pricing', orgId, planId, timestamp),
    responses: [ buildResponse(200, unique(defaultPricingPlanId, timestamp)) ]
  }
];

const provisioning = {
  resourceTypeUrl: {
    withDefaultParam: (timestamp) => provPluginResTypeUrl(unique(resourceId, timestamp)),
    withParam: (resourceId, timestamp) => provPluginResTypeUrl(unique(resourceId, timestamp))
  },
  pricingPlanUrl: (timestamp) => provPluginPricingPlanUrl(timestamp),
  successfulResponses: provisioningSuccessfulResponses,
  responses: {
    successfulResourceType: (timestamp) => buildResponse(200, unique(resourceType, timestamp)),
    successfulPricingPlan: buildResponse(200, defaultPricingPlan),
    resourceType: (statusCode, body) => buildResponse(statusCode, body),
    pricingPlan: (statusCode, body) => buildResponse(statusCode, body)
  }
};

const account = {
  url: {
    withDefaultParams: (time) => accountPluginGetAccountUrl(orgId, time),
    withProvidedParams: (time, orgId) => accountPluginGetAccountUrl(orgId, time)
  },
  accountPluginGetPlanIdUrl: {
    withDefaultParams: (time, type) => accountPluginGetPlanUrl(type, orgId, planId, time),
    withProvidedParams: (time, type, orgId, planId) => accountPluginGetPlanUrl(type, orgId, planId, time)
  },
  successfulResponses: accountSuccessfulResponses,
  responses: {
    successfulGetAccount: buildResponse(200, createAccount(accountId, pricingCountry, orgId)),
    getAccount: (accountId, pricingCountry, orgId, statusCode) => buildResponse(
      statusCode,
      createAccount(accountId, pricingCountry, orgId)
    ),
    successfulGetMeteringPlanIdResponse: buildResponse(200, defaultMeteringPlanId),
    successfulGetRatingPlanIdResponse: buildResponse(200, defaultRatingPlanId),
    successfulGetPricingPlanIdResponse: (time) => buildResponse(200, unique(defaultPricingPlanId, time)),
    getPlanId: (statusCode, planId) => buildResponse(statusCode, planId)
  }
};

const accumulator = {
  url: accumulatorUrl,
  successfulResponses: () => [{
    url: accumulatorUrl,
    responses: [ buildResponse(201, 'CREATED') ]
  }]
};

module.exports = {
  provisioning,
  account,
  accumulator
};
module.exports.usageDoc = (config) => createUsageDoc(config);
module.exports.getLocationsUrl = (config) => getLocationsUrl(config);
module.exports.buildResponse = buildResponse;
module.exports.buildStubs = buildStubs;
