'use strict';

const moment = require('abacus-moment');

const { env } = require('./env-config'); 
const { createEventBuilder, createSamplerClient, startTokens, reportClient, log } = require('./helper');

const samplerClient = createSamplerClient();
const eventBuilder = createEventBuilder();

const postServicesMappings = async() => {
  const mapping = {
    'resource_id': 'sampler-postgresql',
    'plan_id': 'v9.4-large',
    'metering_plan': 'standard-services-hours',
    'rating_plan': 'standard-services-hours',
    'pricing_plan': 'standard-services-hours'
  };
  return await samplerClient.createMapping(mapping);
};

const stopUncleanedEventsBefore = async(orgId, time) => {
  const stopEvent = eventBuilder.stopEvent(orgId, time);
  return await samplerClient.stop(stopEvent);
};

const getMonthlySummaryValue = (report) => {
  const resourceIndex = 0;
  const aggrUsageMetricIndex = 0;
  const monthWindowIndex = 4;
  const currentMonthIndex = 0;
  const parsedReport = JSON.parse(report);

  if(parsedReport.resources.length < 1)
    return 0;

  return parsedReport
    .resources[resourceIndex]
    .aggregated_usage[aggrUsageMetricIndex]
    .windows[monthWindowIndex][currentMonthIndex]
    .quantity;
};

const check = (response) => ({
  is: (expectations) => {
    expect(response.statusCode).to.be.oneOf(expectations);
    return response;
  }
});

describe('Sampler smoke test', () => {
  const orgId = '62332d73-d1ce-4da1-8455-64cc0f7e0b21';
  
  let stopEvent;
  let startEvent;
  let endSpanTime;
  let startSpanTime;
  let firstReport;

  setEventuallyPollingInterval(env.pollInterval);
  setEventuallyTimeout(env.totalTimeout);

  beforeEach(async() => {
    startSpanTime = moment.utc().subtract(2, 'days').valueOf();
    endSpanTime = moment.utc().subtract(1, 'day').valueOf();

    if(env.secured)
      await startTokens();

    check(log(await postServicesMappings())).is([201, 409]);
    check(log(await stopUncleanedEventsBefore(orgId, startSpanTime))).is([201, 422]);

    await eventually(async() => firstReport = check(log(await reportClient.getReport(orgId, startSpanTime))).is([200]));

    startEvent = eventBuilder.startEvent(orgId, startSpanTime);
    stopEvent = eventBuilder.stopEvent(orgId, endSpanTime);
  });

  afterEach(async() => {
    log(await samplerClient.stop(stopEvent));
  });

  it('samples usage to Abacus successfully', async () => {
    check(log(await samplerClient.start(startEvent))).is([201]);
    check(log(await samplerClient.stop(stopEvent))).is([201]);

    await eventually(async () => {
      const currentReport = check(log(await reportClient.getReport(orgId, moment.now()))).is([200]);
      expect(getMonthlySummaryValue(currentReport.body)).not.to.be.equal(getMonthlySummaryValue(firstReport.body));
    });
  });
});
