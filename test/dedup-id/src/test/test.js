'use strict';

const moment = require('abacus-moment');
const request = require('abacus-request');
const { extend } = require('underscore');
const util = require('util');
const uuid = require('uuid');

const debug = require('abacus-debug')('abacus-dedup-id-test');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const collectorURL = process.env.COLLECTOR_URL || 'http://localhost:9080';
const reportingURL = process.env.REPORTING_URL || 'http://localhost:9088';
const localMeterURL = 'http://localhost:9100';
const pollInterval = process.env.POLL_INTERVAL || 300;


describe('dedup acceptance test', () => {
  const timestamp = moment.now();
  const testQuantity = 1;
  const dedupId = 'test-dedup-id';
  const differentDedupId = 'different-dedup-id';

  let docWithoutDedupId;
  let docWithDedupId;
  let orgId;

  const buildUsageDoc = (orgID, dedupId) => {
    const usageDoc = {
      start: timestamp,
      end: timestamp,
      organization_id: orgID,
      space_id: 'test-dedup-id-space-id',
      consumer_id: 'test-dedup-id-consumer-id',
      resource_id: 'object-storage',
      plan_id: 'basic',
      resource_instance_id: 'test-dedup-id-resource-instance-id',
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

  // On local environment GET by location header is not routed to meter
  const buildCorrectLocationHeaderUrl = (url) => {
    if(url.indexOf('localhost') > -1)
      return localMeterURL + url.substring(url.indexOf('v1/') - 1, url.length);
    return url;
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
      await sleep(pollInterval);
    }
  };

  const sendUsage = async (usage) => {
    const resp = await doPost(collectorURL + '/v1/metering/collected/usage', {
      body: usage
    });

    expect(resp.statusCode).to.equal(202);

    return buildCorrectLocationHeaderUrl(resp.headers.location);
  };

  beforeEach(() => {
    orgId = `dedup-acceptance-${uuid.v4()}`;
    docWithoutDedupId = buildUsageDoc(orgId);
    docWithDedupId = buildUsageDoc(orgId, dedupId);
  });

  context('two consequtive documets with same timestamp', () => {

    const verifyReport = async (orgID, expectedQuantiy) => {
      const heavyApiCallsIndex = 2;
      const objectStorageIndex = 0;
      const currentMonth = 0;
      const monthsReport = 4;

      await eventually(async () => {
        const report = await doGet(':url/v1/metering/organizations/:organization_id/aggregated/usage', {
          url: reportingURL,
          organization_id: orgID
        });

        const resources = report.body.resources;
        expect(resources.length).to.equal(1);
        const aggregatedUsage = resources[objectStorageIndex].aggregated_usage;
        expect(aggregatedUsage.length).to.equal(3);
        const currentMonthReport = aggregatedUsage[heavyApiCallsIndex].windows[monthsReport][currentMonth];
        expect(currentMonthReport.summary).to.equal(expectedQuantiy);
      });
    };

    context('first doc without dedup id', () => {
      beforeEach(async () => {
        await sendUsage(docWithoutDedupId);
      });

      it('and second doc without dedup id result in proper report', async () => {
        await sendUsage(docWithoutDedupId);
        await verifyReport(orgId, testQuantity);
      });

      it('and second doc with dedup id result in proper report',
        async () => {
          await sendUsage(docWithDedupId);
          await verifyReport(orgId, testQuantity * 2);
        });
    });

    context('first doc with dedup id', () => {
      beforeEach(async () => {
        await sendUsage(docWithDedupId);
      });

      it('and second doc with the same dedup id result in proper report', async () => {
        await sendUsage(docWithDedupId);
        await verifyReport(orgId, testQuantity);
      });

      it('and second doc with different dedup id result in proper report',
        async () => {
          const docWithDifferentDedupId = buildUsageDoc(orgId, differentDedupId);
          await sendUsage(docWithDifferentDedupId);
          await verifyReport(orgId, testQuantity * 2);
        });
    });
  });

  context('location header', () => {

    const verifyLocationHeader = async (locationHeader) => {
      await eventually(async() => {
        const response = await doGet(locationHeader);
        expect (response.body.measured_usage[0].quantity).to.equal(testQuantity);
      });
    };

    it('doc with dedup id result in existing location header', async () => {
      await verifyLocationHeader(await sendUsage(docWithDedupId));
    });

    it('doc without dedup id result in existing location header', async () => {
      await verifyLocationHeader(await sendUsage(docWithoutDedupId));
    });
  });

});
