'use strict';

const moment = require('abacus-moment');
process.env.CLUSTER = false;
// const rabbitUri = 'amqp://localhost:5672';
const queueNamePrefix = 'abacus-collect-queue';
const fixture = require('./fixture');

// const { Producer, ConnectionManager } = require('abacus-rabbitmq');
const rabbitClient = require('./rabbit-client');

describe('test meter app', () => {
  let queueName;

  let sandbox;

  let stubs;
  let meter;

  beforeEach(async() => {
    delete process.env.ABACUS_COLLECT_QUEUE;
    queueName = queueNamePrefix + moment.now();
    process.env.ABACUS_COLLECT_QUEUE = queueName;
    sandbox = sinon.sandbox.create();
    await rabbitClient.deleteQueue(queueName);
  });

  afterEach(async() => {
    stubs.accumulator.reset();
    stubs.account.reset();
    stubs.provisioning.reset();

    await stubs.accumulator.close();
    await stubs.account.close();
    await stubs.provisioning.close();

    if(meter)
      meter.close();

    sandbox.reset();
  });

  const startApps = (stubs) => {
    stubs.provisioning.startApp(9880);
    stubs.account.startApp(9881);
    stubs.accumulator.startApp(9200);
  };

  const postUsage = async(usage) => {
    const meterApp = require('abacus-usage-meter');
    meter = await meterApp();

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
        expect(stubs.provisioning.getCallCount(fixture.provisioning.pricingPlanUrl(timestamp))).to.equal(1);
      });

    });

    context('when getting pricing plan fails', () => {
      beforeEach(async() => {
        timestamp = moment.now();
        const config = {
          provisioning: [{
            url: fixture.provisioning.resourceTypeUrl.withDefaultParam(timestamp),
            responses: [
              fixture.provisioning.responses.successfulResourceType(timestamp)
            ]
          },
          {
            url: fixture.provisioning.pricingPlanUrl(timestamp),
            responses: [
              fixture.buildResponse(500),
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
        expect(stubs.provisioning.getCallCount(fixture.provisioning.pricingPlanUrl(timestamp))).to.equal(2);
      });

    });
  });

  context('when account fails', () => {
    let timestamp;
    // TODO FIX URLS and RESPONSES
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

  });

});
