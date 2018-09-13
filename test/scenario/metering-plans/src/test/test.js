'use strict';

const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const request = require('abacus-request');
const util = require('util');
const uuid = require('uuid');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const env = {
  secured: process.env.SECURED === 'true',
  systemClientId: process.env.SYSTEM_CLIENT_ID,
  systemClientSecret: process.env.SYSTEM_CLIENT_SECRET,
  authServerURL: process.env.AUTH_SERVER || 'http://localhost:9882',
  collectorURL: process.env.COLLECTOR_URL || 'http://localhost:9080',
  reportingURL: process.env.REPORTING_URL || 'http://localhost:9088',
  provisioningURL: process.env.PROVISIONING_URL || 'http://localhost:9880',
  pollInterval: process.env.POLL_INTERVAL || 300
};

describe('standard services hours scenario test', () => {
  const timestamp = moment.now();
  const hourInMillis = 60 * 60 * 1000;
  const resourceId = 'sampler-test-resource-id';
  const meteringPlanId = 'standard-services-hours';
  const planName = 'standard';

  let usageDoc;
  let orgID;
  let systemToken;

  const authHeader = (token) => token ? { authorization: token() } : {};

  const buildUsageDoc = (orgID, hours) => {
    const usageDoc = {
      start: timestamp,
      end: timestamp,
      organization_id: orgID,
      dedup_id: uuid.v4(),
      space_id: 'sampler-space-id',
      consumer_id: 'sampler-consumer-id',
      resource_id: resourceId,
      plan_id: planName,
      resource_instance_id: 'sampler-resource-instance-id',
      measured_usage: [{
        measure: 'duration',
        quantity: hourInMillis * hours
      }]
    };

    return usageDoc;
  };

  const sendUsage = async (usage) => {
    const resp = await doPost(':url/v1/metering/collected/usage', {
      url: env.collectorURL,
      headers: authHeader(systemToken),
      body: usage
    });

    expect(resp.statusCode).to.equal(202);
    return resp.headers.location;
  };

  const createMeteringMapping = async(resourceType, planName, meteringPlanID, token) =>
    await doPost(':url/v1/provisioning/mappings/metering/resources/:resource_type/plans/:plan_name/:plan_id', {
      url: env.provisioningURL,
      headers: authHeader(token),
      resource_type: resourceType,
      plan_name: planName,
      plan_id: meteringPlanID
    });

  const createRatingMapping = async (resourceType, planName, meteringPlanID, token) =>
    await doPost(':url/v1/provisioning/mappings/rating/resources/:resource_type/plans/:plan_name/:plan_id', {
      url: env.provisioningURL,
      headers: authHeader(token),
      resource_type: resourceType,
      plan_name: planName,
      plan_id: meteringPlanID
    });

  const createPricingMapping = async (resourceType, planName, meteringPlanID, token) =>
    await doPost(':url/v1/provisioning/mappings/pricing/resources/:resource_type/plans/:plan_name/:plan_id', {
      url: env.provisioningURL,
      headers: authHeader(token),
      resource_type: resourceType,
      plan_name: planName,
      plan_id: meteringPlanID
    });

  before(async() => {
    if(env.secured) {
      systemToken = oauth.cache(env.authServerURL, env.systemClientId, env.systemClientSecret,
        'abacus.usage.read abacus.usage.write'
      );

      const promisifiedTokenStart = util.promisify(systemToken.start);
      await promisifiedTokenStart();
    }

    setEventuallyPollingInterval(env.pollInterval);

    await Promise.all([
      createMeteringMapping(resourceId, planName, meteringPlanId, systemToken),
      createRatingMapping(resourceId, planName, meteringPlanId, systemToken),
      createPricingMapping(resourceId, planName, meteringPlanId, systemToken)
    ]);
  });

  context('submit usages', () => {
    beforeEach(() => {
      orgID = `sampler-plan-scenario-${uuid.v4()}`;
    });

    it('generated report should be correct', async() => {
      const usageHours = {
        firstDoc: 2,
        secondDoc: 4,
        thirdDoc: -1
      };
      const currentMonth = 0;
      const monthsReport = 4;
      const usageHoursIndex = 0;
      const samplerTestResourceIdIndex = 0;

      usageDoc = buildUsageDoc(orgID, usageHours.firstDoc);
      await sendUsage(usageDoc);

      usageDoc = buildUsageDoc(orgID, usageHours.secondDoc);
      await sendUsage(usageDoc);

      usageDoc = buildUsageDoc(orgID, usageHours.thirdDoc);
      await sendUsage(usageDoc);


      await eventually(async () => {
        const report = await doGet(':url/v1/metering/organizations/:organization_id/aggregated/usage', {
          url: env.reportingURL,
          headers: authHeader(systemToken),
          organization_id: orgID
        });

        const resources = report.body.resources;
        expect(resources.length).to.equal(1);
        const aggregatedUsage = resources[samplerTestResourceIdIndex].aggregated_usage;
        expect(aggregatedUsage.length).to.equal(1);
        const currentMonthReport = aggregatedUsage[usageHoursIndex].windows[monthsReport][currentMonth];
        expect(currentMonthReport.summary).to.equal(usageHours.firstDoc + usageHours.secondDoc + usageHours.thirdDoc);
      });
    });
  });

});
