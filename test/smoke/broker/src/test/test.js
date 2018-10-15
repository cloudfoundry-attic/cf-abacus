'use strict';

const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const { yieldable, functioncb } = require('abacus-yieldable');

const cfUtil = require('abacus-test-cf-util');
const abacusUtil = require('abacus-test-abacus-util');
const staticAppsUtil = require('abacus-static-apps-util');
const { checkCorrectSetup } = require('abacus-test-helper');

const { findWhere, first, last } = require('underscore');

const testEnv = {
  api: process.env.CF_API_URI,
  user: process.env.CF_ADMIN_USER,
  password: process.env.CF_ADMIN_PASSWORD,
  org: process.env.CF_BROKER_SMOKE_ORG,
  space: process.env.CF_BROKER_SMOKE_SPACE,
  appsDomain: process.env.APPS_DOMAIN,
  collectorUrl: process.env.COLLECTOR_URL,
  reportingUrl: process.env.REPORTING_URL,
  serviceName: process.env.SERVICE_NAME,
  servicePlan: process.env.SERVICE_PLAN,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 600000
};

let abacusClient;

describe('Abacus Broker Smoke test', function() {
  this.timeout(testEnv.totalTimeout);
  let app;
  let serviceInstance;
  let testAppClient;

  before(() => {
    checkCorrectSetup(testEnv);

    abacusClient = abacusUtil(
      undefined,
      testEnv.collectorUrl,
      testEnv.reportingUrl);

    const cf = cfUtil({
      api: testEnv.api,
      user: testEnv.user,
      password: testEnv.password
    });

    app = cf.App.deploy({
      target:{
        orgName: testEnv.org,
        spaceName: testEnv.space
      },
      app: {
        name:  `${moment.utc().valueOf()}-test-app`,
        manifest: staticAppsUtil.testAppManifestLocation()
      }
    });
    serviceInstance = cf.Service.createInstance({
      spaceGuid: app.spaceGuid,
      instanceName: `test-${moment.utc().valueOf()}`,
      service: {
        name: testEnv.serviceName,
        plan: testEnv.servicePlan
      }
    });
    testAppClient = staticAppsUtil.testAppClient(app.getUrl());
  });

  after(() => {
    serviceInstance.destroy();
  });

  it('should validate standard metering service instance', functioncb(function*() {
    serviceInstance.bind(app.guid);
    app.restart();

    const credentials = yield yieldable(testAppClient.getCredentials);
    expect(credentials).to.have.property('client_id');
    expect(credentials).to.have.property('client_secret');
    expect(credentials).to.have.property('resource_id');
    expect(credentials).to.have.property('plans');

    const resourceId = credentials.resource_id;
    const clientId = credentials.client_id;
    const clientSecret = credentials.client_secret;

    const usageToken = oauth.cache(testEnv.api, clientId, clientSecret,
      `abacus.usage.${resourceId}.write,abacus.usage.${resourceId}.read`);
    yield yieldable(usageToken.start);

    const now = moment.utc().valueOf();
    const resourceInstanceId = `${now}-151-413-121-110987654321d`;
    const consumerId = `app:${resourceInstanceId}`;

    const expectedQuantity = 512;

    const usageBody = {
      start: now,
      end: now,
      organization_id: app.orgGuid,
      space_id: app.spaceGuid,
      resource_id: resourceId,
      plan_id: 'standard',
      consumer_id: consumerId,
      resource_instance_id: resourceInstanceId,
      measured_usage: [{
        measure: 'sampleName',
        quantity: expectedQuantity
      }]
    };

    console.log('\nPosting usage ...');
    const postResponse = yield yieldable(testAppClient.postUsage)(usageBody);
    expect(postResponse.statusCode).to.equal(202, 'usage was not submitted successfully');

    const locationHeader = postResponse.headers.location;
    expect(locationHeader).to.not.equal(undefined);

    console.log('\nWaiting for usage to be processed ...\n');
    yield yieldable(abacusClient.waitUntilUsageIsProcessed)(usageToken, locationHeader, testEnv.totalTimeout);

    console.log('\nGetting report ...\n');
    const getResponse = yield yieldable(abacusClient.getOrganizationUsage)(usageToken, app.orgGuid);
    expect(getResponse.statusCode).to.equal(200, 'usage was not retrieved successfully');
    expect(getResponse.body.resources.length).to.equal(1, 'number of resources was not the expected');

    const expectedSpace = findWhere(getResponse.body.spaces, { space_id: app.spaceGuid });
    expect(expectedSpace.resources.length).to.equal(1,'number of spaces was not the expected');

    const expectedConsumer = findWhere(expectedSpace.consumers, { consumer_id: consumerId });
    expect(expectedConsumer.resources.length).to.equal(1, 'number of consumers was not the expected');

    const expectedResources = findWhere(getResponse.body.resources, { resource_id: resourceId });
    expect(expectedResources.resource_id).to.equal(resourceId, 'resource provider was different than expected');

    const monthlyQty = first(last(first(first(expectedResources.plans).aggregated_usage).windows)).quantity;
    expect(monthlyQty).to.equal(expectedQuantity, 'monthly quantity was not the expected one');
  }));
});
