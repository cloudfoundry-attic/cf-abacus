'use strict';

const moment = require('abacus-moment');
const request = require('abacus-request');
const util = require('util');
const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-dedup-id-test');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const collectorURL = process.env.COLLECTOR_URL || 'http://localhost:9080';
const reportingURL = process.env.REPORTING_URL || 'http://localhost:9088';


describe('dedup acceptance test', () => {
  const testQuantity = 1;
  const dedupId = 'test-dedup-id';

  let timestamp;
  let orgId;
  let docWithoutDedupId;
  let docWithDedupId;

  const buildUsageDoc = (time, dedupId) => {
    const usageDoc = {
      start: time,
      end: time,
      organization_id: orgId,
      space_id: 'test-space-id',
      consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      resource_id: 'object-storage',
      plan_id: 'basic',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
      measured_usage: [{
        measure: 'heavy_api_calls',
        quantity: testQuantity
      }]
    };
    if (dedupId)
      extend(usageDoc, {
        dedup_id: dedupId
      });

    return usageDoc;
  };

  const sleep = (duration) => {
    return new Promise((cb) => setTimeout(cb, duration));
  };

  const eventually = async (func) => {
    while (true) {
      try {
        return await func();
      } catch (e) {
        debug('not ready yet: %o', e.message);
      }
      await sleep(1000);
    }
  };

  const sendUsage = async (usage) => {
    const resp = await doPost(collectorURL + '/v1/metering/collected/usage', {
      body: usage
    });

    expect(resp.statusCode).to.equal(202);
  };

  const verifyReport = async (expectedQuantiy) => {
    await eventually(async () => {
      const report = await doGet(':url/v1/metering/organizations/:organization_id/aggregated/usage', {
        url: reportingURL,
        organization_id: orgId
      });
      expect(report.body.resources[0].aggregated_usage[2].windows[4][0].summary).to.equal(expectedQuantiy);
    });
  };

  beforeEach(() => {
    timestamp = moment.now();
    orgId = `dedup-acceptance-${timestamp}`;
    docWithDedupId = buildUsageDoc(timestamp, dedupId);
  });

  context('two consequtive documets with same timestamp', () => {

    beforeEach(async () => {
      docWithoutDedupId = buildUsageDoc(timestamp);
      await sendUsage(docWithoutDedupId);
    });

    it('without dedup id result in proper report', async () => {
      await sendUsage(docWithoutDedupId);
      await verifyReport(testQuantity);
    });

    it('with and without dedup id result in proper report',
      async () => {
        await sendUsage(docWithDedupId);
        await verifyReport(testQuantity * 2);
      });
  });

  context('two consequtive documets with same timestamp', () => {

    beforeEach(async () => {
      await sendUsage(docWithDedupId);
    });

    it('with equal dedup id result in proper report', async () => {
      await sendUsage(docWithDedupId);
      await verifyReport(testQuantity);
    });

    it('with different dedup id result in proper report',
      async () => {
        const docWithDifferentDedupId = buildUsageDoc(timestamp, 'different-dedup-id');
        await sendUsage(docWithDifferentDedupId);
        await verifyReport(testQuantity * 2);
      });
  });

});
