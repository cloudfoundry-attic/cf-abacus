'use strict';

const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const request = require('abacus-request');
const { extend } = require('underscore');
const util = require('util');
const uuid = require('uuid');

const debug = require('abacus-debug')('abacus-dedup-id-test');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const systemClientId = process.env.CLIENT_ID;
const systemClientSecret = process.env.CLIENT_SECRET;
const authServerURL = process.env.AUTH_SERVER_URL || 'http://localhost:9882';
const collectorURL = process.env.COLLECTOR_URL || 'http://localhost:9080';
const reportingURL = process.env.REPORTING_URL || 'http://localhost:9088';
const pollInterval = process.env.POLL_INTERVAL || 300;

const localMeterURL = 'http://localhost:9100';

describe('dedup acceptance test', () => {
  const timestamp = moment.now();
  const testQuantity = 1;
  const dedupId = 'test-dedup-id';
  const differentDedupId = 'different-dedup-id';

  let docWithoutDedupId;
  let docWithDedupId;
  let orgId;

  let systemToken;

  const secured = process.env.SECURED === 'true';

  const authHeader = (token) => {
    return token ?
      {
        headers: {
          authorization: token()
        }
      } :
      {};
  };

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
    const resp = await doPost(collectorURL + '/v1/metering/collected/usage',
      extend({ body: usage }, authHeader(systemToken)));

    expect(resp.statusCode).to.equal(202);
    return buildCorrectLocationHeaderUrl(resp.headers.location);
  };

  before((done) => {
    if(!secured)
      done();
    else {
      systemToken = oauth.cache(authServerURL, systemClientId, systemClientSecret,
        'abacus.usage.read abacus.usage.write'
      );

      systemToken.start((err) => {
        if (err) done(new Error(`Unable to obtain system oAuth token due to ${err}`));
        else done();
      });
    }
  });

  beforeEach(() => {
    orgId = `dedup-acceptance-${uuid.v4()}`;
    docWithoutDedupId = buildUsageDoc(orgId);
    docWithDedupId = buildUsageDoc(orgId, dedupId);
  });

  context('two consecutive documets with same timestamp', () => {

    const verifyReport = async (orgID, expectedQuantity) => {
      const heavyApiCallsIndex = 2;
      const objectStorageIndex = 0;
      const currentMonth = 0;
      const monthsReport = 4;

      await eventually(async () => {
        const report = await doGet(':url/v1/metering/organizations/:organization_id/aggregated/usage', extend ({
          url: reportingURL,
          organization_id: orgID
        }, authHeader(systemToken)));

        const resources = report.body.resources;
        expect(resources.length).to.equal(1);
        const aggregatedUsage = resources[objectStorageIndex].aggregated_usage;
        expect(aggregatedUsage.length).to.equal(3);
        const currentMonthReport = aggregatedUsage[heavyApiCallsIndex].windows[monthsReport][currentMonth];
        expect(currentMonthReport.summary).to.equal(expectedQuantity);
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

      it('and second doc with dedup id result in proper report', async () => {
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
      const heavyApiCallsIndex = 0;

      await eventually(async() => {
        const response = await doGet(locationHeader, authHeader(systemToken));

        expect(response.statusCode).to.equal(200);

        const measuredUsage = response.body.measured_usage;

        expect(measuredUsage.length).to.equal(1);
        expect(measuredUsage[heavyApiCallsIndex].quantity).to.equal(testQuantity);
      });
    };

    it('for doc with dedup id result in existing location header', async () => {
      await verifyLocationHeader(await sendUsage(docWithDedupId));
    });

    it('for doc without dedup id result in existing location header', async () => {
      await verifyLocationHeader(await sendUsage(docWithoutDedupId));
    });
  });

});
