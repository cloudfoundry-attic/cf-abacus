'use strict';

const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const lifecycleManager = require('abacus-lifecycle-manager')();

const fixture = require('./fixture');
const rabbitClient = require('./rabbit-client');

const { extend } = require('underscore');

const queueName = 'meter-itest-queue';
const mainExchange = 'meter-itest-main-exchange';
const firstDlName = 'meter-itest-first-dl';
const firstDlExchange = 'meter-itest-first-exchange';
const secondDlName = 'meter-itest-second-dl';
const secondDlExchange = 'meter-itest-second-exchange';
const { checkCorrectSetup } = require('abacus-test-helper');

const testEnv = {
  db: process.env.DB_URI || 'mongodb://localhost:27017'
};

describe('meter integration test', () => {
  let stubs;

  before(async() => {
    checkCorrectSetup(testEnv);
    const modules = [lifecycleManager.modules.meter];
    const customEnv = extend({}, process.env, {
      CLUSTER: false,
      ABACUS_COLLECT_QUEUE: queueName,
      MAIN_EXCHANGE: mainExchange,
      FIRST_DL_NAME: firstDlName,
      FIRST_DL_EXCHANGE: firstDlExchange,
      SECOND_DL_NAME: secondDlName,
      SECOND_DL_EXCHANGE: secondDlExchange
    });

    // drop all abacus collections except plans and plan-mappings
    dbclient.drop(testEnv.db, /^abacus-((?!plan).)*$/, () => {
      lifecycleManager.useEnv(customEnv).startModules(modules);
    });

    await rabbitClient.deleteQueue(queueName);
  });

  after(() => {
    lifecycleManager.stopAllStarted();
  });

  afterEach(async() => {
    stubs.accumulator.reset();
    stubs.account.reset();
    stubs.provisioning.reset();

    await stubs.accumulator.close();
    await stubs.account.close();
    await stubs.provisioning.close();
  });

  const startApps = (stubs) => {
    stubs.provisioning.startApp(9880);
    stubs.account.startApp(9881);
    stubs.accumulator.startApp(9200);
  };

  const postUsage = async(usage) => {
    await rabbitClient.sendToQueue(queueName, usage);
  };

  context('on success', () => {
    beforeEach(async() => {
      const timestamp = moment.now();
      const config = {
        provisioning: fixture.provisioning.successfulResponses(timestamp),
        account: fixture.account.successfulResponses(timestamp),
        accumulator: fixture.accumulator.successfulResponses()
      };
      const usage = fixture.usageDoc({ time: timestamp });

      stubs = fixture.buildStubs(config);
      startApps(stubs);

      await postUsage(usage);
    });

    it('consumes messages', async() => {
      await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
    });
  });

  context('when accumulator fails', () => {
    beforeEach(async() => {
      const timestamp = moment.now();
      const config = {
        provisioning: fixture.provisioning.successfulResponses(timestamp),
        account: fixture.account.successfulResponses(timestamp),
        accumulator: [{
          url: fixture.accumulator.url,
          responses: [
            fixture.buildResponse(500),
            fixture.buildResponse(201, 'CREATED')
          ]
        }]
      };
      const usage = fixture.usageDoc({ time: timestamp });

      stubs = fixture.buildStubs(config);
      startApps(stubs);

      await postUsage(usage);
    });

    it('retries the message once', async() => {
      await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(2);
      expect(stubs.accumulator.getCallCount(fixture.accumulator.url)).to.equal(2);
    });
  });

  context('when accumulator fails with non-retryable error', () => {
    beforeEach(async() => {
      const timestamp = moment.now();
      const config = {
        provisioning: fixture.provisioning.successfulResponses(timestamp),
        account: fixture.account.successfulResponses(timestamp),
        accumulator: [{
          url: fixture.accumulator.url,
          responses: [
            fixture.buildResponse(422),
            fixture.buildResponse(201, 'CREATED')
          ]
        }]
      };
      const usage = fixture.usageDoc({ time: timestamp });

      stubs = fixture.buildStubs(config);
      startApps(stubs);

      await postUsage(usage);
    });

    it('does not retry', async() => {
      await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
      expect(stubs.accumulator.getCallCount(fixture.accumulator.url)).to.equal(1);
    });
  });

  context('when provisioning fails', () => {
    let timestamp;

    context('when getting resource type fails', () => {
      beforeEach(async() => {
        timestamp = moment.now();
        const config = {
          provisioning: [{
            url: fixture.provisioning.resourceTypeUrl.withDefaultParam(timestamp),
            responses: [
              fixture.buildResponse(500),
              fixture.provisioning.responses.successfulResourceType(timestamp)
            ]
          },
          {
            url: fixture.provisioning.pricingPlanUrl(timestamp),
            responses: [
              fixture.provisioning.responses.successfulPricingPlan
            ]
          }
          ],
          account: fixture.account.successfulResponses(timestamp),
          accumulator: fixture.accumulator.successfulResponses()
        };
        const usage = fixture.usageDoc({ time: timestamp });

        stubs = fixture.buildStubs(config);
        startApps(stubs);

        await postUsage(usage);
        await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
      });

      it('retries the calls', () => {
        expect(stubs.provisioning.getCallCount(fixture.provisioning.resourceTypeUrl
          .withDefaultParam(timestamp))).to.equal(2);
      });
    });

  });

  context('when account fails', () => {
    let timestamp;
    context('when getting account fails', () => {
      beforeEach(async() => {
        timestamp = moment.now();
        const config = {
          provisioning: fixture.provisioning.successfulResponses(timestamp),
          account: [
            {
              url: fixture.account.url.withDefaultParams(timestamp),
              responses: [
                fixture.buildResponse(500),
                fixture.account.responses.successfulGetAccount
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'metering'),
              responses: [
                fixture.account.responses.successfulGetMeteringPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'rating'),
              responses: [
                fixture.account.responses.successfulGetRatingPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'pricing'),
              responses: [
                fixture.account.responses.successfulGetPricingPlanIdResponse(timestamp)
              ]
            }

          ],
          accumulator: fixture.accumulator.successfulResponses()
        };
        const usage = fixture.usageDoc({ time: timestamp });

        stubs = fixture.buildStubs(config);
        startApps(stubs);

        await postUsage(usage);
        await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
      });

      it('retries the calls', () => {
        expect(stubs.account.getCallCount(fixture.account.url.withDefaultParams(timestamp))).to.equal(2);
      });

    });

    context('when getting metering plan id fails', () => {
      beforeEach(async() => {
        timestamp = moment.now();
        const config = {
          provisioning: fixture.provisioning.successfulResponses(timestamp),
          account: [
            {
              url: fixture.account.url.withDefaultParams(timestamp),
              responses: [
                fixture.account.responses.successfulGetAccount
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'metering'),
              responses: [
                fixture.buildResponse(500),
                fixture.account.responses.successfulGetMeteringPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'rating'),
              responses: [
                fixture.account.responses.successfulGetRatingPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'pricing'),
              responses: [
                fixture.account.responses.successfulGetPricingPlanIdResponse(timestamp)
              ]
            }
          ],
          accumulator: fixture.accumulator.successfulResponses()
        };
        const usage = fixture.usageDoc({ time: timestamp });

        stubs = fixture.buildStubs(config);
        startApps(stubs);

        await postUsage(usage);
        await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
      });

      it('retries the calls', () => {
        expect(stubs.account.getCallCount(fixture.account.accountPluginGetPlanIdUrl
          .withDefaultParams(timestamp, 'metering'))).to.equal(2);
      });

    });

    context('when getting rating plan id fails', () => {
      beforeEach(async() => {
        timestamp = moment.now();
        const config = {
          provisioning: fixture.provisioning.successfulResponses(timestamp),
          account: [
            {
              url: fixture.account.url.withDefaultParams(timestamp),
              responses: [
                fixture.account.responses.successfulGetAccount
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'metering'),
              responses: [
                fixture.account.responses.successfulGetMeteringPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'rating'),
              responses: [
                fixture.buildResponse(500),
                fixture.account.responses.successfulGetRatingPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'pricing'),
              responses: [
                fixture.account.responses.successfulGetPricingPlanIdResponse(timestamp)
              ]
            }
          ],
          accumulator: fixture.accumulator.successfulResponses()
        };
        const usage = fixture.usageDoc({ time: timestamp });

        stubs = fixture.buildStubs(config);
        startApps(stubs);

        await postUsage(usage);
        await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
      });

      it('retries the calls', () => {
        expect(stubs.account.getCallCount(fixture.account.accountPluginGetPlanIdUrl
          .withDefaultParams(timestamp, 'rating'))).to.equal(2);
      });

    });

    context('when getting pricing plan id fails', () => {
      beforeEach(async() => {
        timestamp = moment.now();
        const config = {
          provisioning: fixture.provisioning.successfulResponses(timestamp),
          account: [
            {
              url: fixture.account.url.withDefaultParams(timestamp),
              responses: [
                fixture.account.responses.successfulGetAccount
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'metering'),
              responses: [
                fixture.account.responses.successfulGetMeteringPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'rating'),
              responses: [
                fixture.account.responses.successfulGetRatingPlanIdResponse
              ]
            },
            {
              url: fixture.account.accountPluginGetPlanIdUrl.withDefaultParams(timestamp, 'pricing'),
              responses: [
                fixture.buildResponse(500),
                fixture.account.responses.successfulGetPricingPlanIdResponse(timestamp)
              ]
            }
          ],
          accumulator: fixture.accumulator.successfulResponses()
        };
        const usage = fixture.usageDoc({ time: timestamp });

        stubs = fixture.buildStubs(config);
        startApps(stubs);

        await postUsage(usage);
        await stubs.accumulator.waitUntil.alias(fixture.accumulator.url).isCalled(1);
      });

      it('retries the calls', () => {
        expect(stubs.account.getCallCount(fixture.account.accountPluginGetPlanIdUrl
          .withDefaultParams(timestamp, 'pricing'))).to.equal(2);
      });

    });

  });


});
