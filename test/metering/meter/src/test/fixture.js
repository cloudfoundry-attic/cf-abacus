'use strict';

const mockServer = require('./mock-server');

const orgId = 'org-id';
const resourceId = 'test-resource';
const planId = 'plan-id';
const resourceType = 'resource-type';
const accountId = 'id';
const pricingCountry = 'country';
const defaultPricingPlan = { name: 'storage', price: 1 };
const defaultMeteringPlanId = 'test-metering-plan';
const defaultRatingPlanId = 'test-rating-plan-id';
const defaultPricingPlanId = 'test-pricing-standard';
const createAccount = (accountId, pricingCountry, orgId) => ({
  account_id: accountId,
  pricing_country: pricingCountry,
  organization_id: orgId
});

const createUsageDoc = (time, org = orgId, resource = resourceId, plan = planId) => ({
  start: time,
  end: time,
  organization_id: org,
  space_id: 'space-id',
  consumer_id: 'consumer-id',
  resource_id: resource,
  plan_id: plan,
  resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
  measured_usage: [
    {
      measure: 'light_api_calls',
      quantity: 12
    }
  ]
});

const provPluginResTypeUrl = (resourceId) => `/v1/provisioning/resources/${resourceId}/type`;
// TODO: !!! CHECK THIS CALL !!!
const provPluginPricingPlanUrl = `/v1/pricing/plans/${defaultPricingPlanId}`;
const accountPluginGetAccountUrl = (orgId, time) => `/v1/organizations/${orgId}/account/${time}`;
const accountPluginGetPlanUrl = (type, orgId, planId, time) => `/v1/${type}/organizations/${orgId}/resource_types/` +
  `resource-type/plans/${planId}/time/${time}/${type}_plan/id`;
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

const provisioningSuccessfulResponses = () => [
  {
    url: provPluginResTypeUrl(resourceId),
    responses: [ buildResponse(200, resourceType) ]
  },
  {
    url: provPluginPricingPlanUrl,
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
    responses: [ buildResponse(200, defaultPricingPlanId) ]
  }
];

const provisioning = {
  resourceTypeUrl: {
    withDefaultParam: provPluginResTypeUrl(resourceId),
    withParam: (resourceId) => provPluginResTypeUrl(resourceId)
  },
  pricingPlanUrl: provPluginPricingPlanUrl,
  successfulResponses: provisioningSuccessfulResponses,
  responses: {
    successfulResourceType: buildResponse(200, resourceType),
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
module.exports.usageDoc = (time, orgId, resourceId, planId) => createUsageDoc(time, orgId, resourceId, planId);
module.exports.buildResponse = buildResponse;
module.exports.buildStubs = buildStubs;
