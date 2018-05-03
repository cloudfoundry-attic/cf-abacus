'use strict';

const moment = require('abacus-moment');
const mockServer = require('./mock-server');

const orgId = 'org-id';
const resourceId = 'test-resource';
const planId = 'plan-id';
const resourceType = 'resource-type';
const accountId = 'id';
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

const createUsageDoc = (config) => ({
  start: config.time,
  end: config.time,
  organization_id: config.org ? config.org : orgId,
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
});

const provPluginResTypeUrl = (resourceId, timestamp) => `/v1/provisioning/resources/${resourceId}${timestamp}/type`;

// TODO: !!! CHECK THIS CALL !!!
const provPluginPricingPlanUrl = (timestamp) => `/v1/pricing/plans/${defaultPricingPlanId}${timestamp}`;
const accountPluginGetAccountUrl = (orgId, time) => `/v1/organizations/${orgId}/account/${time}`;
const accountPluginGetPlanUrl = (type, orgId, planId, time) => `/v1/${type}/organizations/${orgId}` +
`/resource_types/resource-type${time}/plans/${planId}/time/${time}/${type}_plan/id`;
const accumulatorUrl = '/v1/metering/metered/usage';

const buildResponse = (statusCode, body = {}) => ({ statusCode: statusCode, body: body });

const buildResourceId = (config) => {
  const resource = config.resource ? config.resource : resourceId;
  const timestamp = config.time ? config.time : moment.now();
  return resource + timestamp;
};

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

const provisioningSuccessfulResponses = (timestamp) => {

  return [
    {
      url: provPluginResTypeUrl(resourceId, timestamp),
      responses: [ buildResponse(200, resourceType + timestamp) ]
    },
    {
      url: provPluginPricingPlanUrl(timestamp),
      responses: [ buildResponse(200, defaultPricingPlan) ]
    }
  ];
};

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
    responses: [ buildResponse(200, defaultPricingPlanId + timestamp) ]
  }
];

const provisioning = {
  resourceTypeUrl: {
    withDefaultParam: (timestamp) => provPluginResTypeUrl(resourceId, timestamp),
    withParam: (resourceId, timestamp) => provPluginResTypeUrl(resourceId, timestamp)
  },
  pricingPlanUrl: (timestamp) => provPluginPricingPlanUrl(timestamp),
  successfulResponses: provisioningSuccessfulResponses,
  responses: {
    successfulResourceType: (timestamp) => buildResponse(200, resourceType + timestamp),
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
    successfulGetPricingPlanIdResponse: buildResponse(200, defaultPricingPlanId),
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
module.exports.resourceId = buildResourceId;
module.exports.buildResponse = buildResponse;
module.exports.buildStubs = buildStubs;
