'use strict';

const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');

const { env, spanConfig } = require('./config');
const { createEventBuilder, createSamplerClient, startTokens, reportClient } = require('./helpers');

const samplerClient = createSamplerClient();
const eventBuilder = createEventBuilder();

const postServicesMappings = async() => {
  const mapping = {
    'resource_id': spanConfig.resource_id,
    'plan_id': spanConfig.plan_id,
    'metering_plan': spanConfig.metering_plan,
    'rating_plan': spanConfig.rating_plan,
    'pricing_plan': spanConfig.pricing_plan
  };
  return await samplerClient.createMapping(mapping);
};

const getMonthlySummaryValue = (report) => {
  const resourceIndex = 0;
  const aggrUsageMetricIndex = 0;
  const monthWindowIndex = 4;
  const currentMonthIndex = 0;
  const parsedReport = JSON.parse(report);

  // when run for the first time, there is no data in report
  if(parsedReport.resources.length < 1)
    return 0;

  return parsedReport
    .resources[resourceIndex]
    .aggregated_usage[aggrUsageMetricIndex]
    .windows[monthWindowIndex][currentMonthIndex]
    .quantity;
};

const log = (msg) => console.log(`${moment.utc().toDate()}: ${msg}`);

describe('Sampler smoke test', () => {
  let response;
  let initialReport;

  setEventuallyPollingInterval(env.pollInterval);
  setEventuallyTimeout(env.totalTimeout);

  beforeEach(async() => {
    if(env.secured)
      await startTokens();

    log('Creating services mappings ...');
    response = await postServicesMappings();
    expect(response.statusCode).to.be.oneOf([httpStatus.CREATED, httpStatus.CONFLICT]);

    log('Cleaning up in case of previous test error ...');
    response = await samplerClient.stopSampling(eventBuilder.createStopEvent(moment.now()));
    expect(response.statusCode).to.be.oneOf([httpStatus.CREATED, httpStatus.UNPROCESSABLE_ENTITY]);

    log('Getting initial report ...');
    await eventually(async() => {
      const response = await reportClient.getReport(spanConfig.organization_id, moment.now());
      expect(response.statusCode).to.be.equal(httpStatus.OK);
      initialReport = response.body;
    });
  });

  afterEach(async() => {
    await samplerClient.stopSampling(eventBuilder.createStopEvent(moment.now()));
  });

  it('samples usage to Abacus successfully', async () => {
    log('Sending start event to sampler ...');
    response = await samplerClient.startSampling(eventBuilder.createStartEvent(moment.now()));
    expect(response.statusCode).to.be.equal(httpStatus.CREATED);

    log('Sending stop event to sampler ...');
    response = await samplerClient.stopSampling(eventBuilder.createStopEvent(moment.now()));
    expect(response.statusCode).to.be.equal(httpStatus.CREATED);

    log('Getting final report ...');
    await eventually(async () => {
      response = await reportClient.getReport(spanConfig.organization_id, moment.now());
      expect(response.statusCode).to.be.equal(httpStatus.OK);
      const currentReport = response.body;
      expect(getMonthlySummaryValue(currentReport)).not.to.be.equal(getMonthlySummaryValue(initialReport));
    });
  });
});
