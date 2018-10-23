'use strict';

const uuid = require('uuid');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');

const { env } = require('./config');
const { createEventBuilder, createSamplerClient, startTokens, reportClient, createReportParser } = require('./helpers');

const samplerClient = createSamplerClient();
const eventBuilder = createEventBuilder();

const postServicesMappings = async(resourceId, planId) => {
  const mapping = {
    'resource_id': resourceId,
    'plan_id': planId,
    'metering_plan': 'standard-services-hours',
    'rating_plan': 'standard-services-hours',
    'pricing_plan': 'standard-services-hours'
  };
  return await samplerClient.createMapping(mapping);
};

const log = (msg) => console.log(`${moment.utc().toDate()}: ${msg}`);

describe('Sampler scenario test', () => {
  let response;

  const resourceId = 'sampler-postgresql';
  const planId = 'v9.4-large';
  const target = {
    organization_id: uuid.v4(),
    space_id: uuid.v4(),
    consumer_id: uuid.v4(),
    resource_id: resourceId,
    plan_id: planId,
    resource_instance_id: uuid.v4()
  };

  setEventuallyPollingInterval(env.pollInterval);
  setEventuallyTimeout(env.totalTimeout);

  beforeEach(async() => {
    if(env.secured)
      await startTokens();

    log('Creating services mappings ...');
    response = await postServicesMappings(resourceId, planId);
    // expect(response.statusCode).to.be.equal(httpStatus.CREATED);
  });

  afterEach(async() => {
    await samplerClient.stopSampling(eventBuilder.createStopEvent(target, moment.now()));
  });

  it('samples usage to Abacus successfully', async () => {
    log('Sending start event to sampler ...');
    const startTimestamp = moment.utc().subtract(2, 'days').valueOf();
    response = await samplerClient.startSampling(eventBuilder.createStartEvent(target, startTimestamp));
    expect(response.statusCode).to.be.equal(httpStatus.CREATED);

    log('Sending stop event to sampler ...');
    const endTimestamp = moment.utc(startTimestamp).add(1, 'day').valueOf();
    response = await samplerClient.stopSampling(eventBuilder.createStopEvent(target, endTimestamp));
    expect(response.statusCode).to.be.equal(httpStatus.CREATED);

    log('Getting final report ...');
    await eventually(async () => {
      response = await reportClient.getReport(target.organization_id, moment.now());
      expect(response.statusCode).to.be.equal(httpStatus.OK);

      const reportParser = createReportParser(response.body);

      const totalQuantity = reportParser.getCurrentMonthQuantity() + reportParser.getPrevMonthQuantity();
      const twentyFourUsageHours = 24;
      expect(totalQuantity).to.be.equal(twentyFourUsageHours);
    });
  });
});
