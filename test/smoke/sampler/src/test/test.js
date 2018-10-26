'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');

const { ReceiverClient, ConflictError, UnprocessableEntityError } = require('abacus-api');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');

const { env, spanConfig } = require('./config');
const { createEventBuilder, reportClient } = require('./helpers');

const eventBuilder = createEventBuilder();

const systemToken = env.secured ?
  oauth.cache(env.api, env.systemClientId, env.systemClientSecret, 'abacus.usage.read abacus.usage.write') :
  undefined;
const samplerToken = env.secured ?
  oauth.cache(env.api, env.clientId, env.clientSecret, 'abacus.sampler.write') :
  undefined;

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
    .summary;
};

const log = (msg) => console.log(`${moment.utc().toDate()}: ${msg}`);

const startTokens = async() => {
  const startSystemToken = util.promisify(systemToken.start);
  const startSamplerToken = util.promisify(samplerToken.start);

  await startSystemToken();
  await startSamplerToken();
};

describe('Sampler smoke test', function() {
  let receiverClient;

  this.timeout(env.totalTimeout);
  setEventuallyPollingInterval(env.pollInterval);
  setEventuallyTimeout(env.totalTimeout);

  before(async() => {
    if(env.secured)
      await startTokens();

    receiverClient = new ReceiverClient(env.receiverUrl, { getHeader: () => samplerToken() }, env.skipSSL);

    log('Creating services mappings ...');
    const mapping = {
      'resource_id': spanConfig.resource_id,
      'plan_id': spanConfig.plan_id,
      'metering_plan': spanConfig.metering_plan,
      'rating_plan': spanConfig.rating_plan,
      'pricing_plan': spanConfig.pricing_plan
    };

    try {
      await receiverClient.createMappings(mapping);
    } catch(e) {
      expect(e.message).to.deep.equal(new ConflictError().message);
    }

    log('Cleaning up in case of previous test error ...');
    try {
      await receiverClient.stopSampling(eventBuilder.createStopEvent(moment.now()));
    } catch(e) {
      expect(e.message).to.deep.equal(new UnprocessableEntityError().message);
    }
  });

  afterEach(async() => {
    log('Stopping sampling in case of test error ...');
    try {
      await receiverClient.stopSampling(eventBuilder.createStopEvent(moment.now()));
    } catch(e) {
      expect(e.message).to.deep.equal(new UnprocessableEntityError().message);
    }
  });

  it('samples usage to Abacus successfully', async () => {

    log('Getting initial report ...');
    let initialReport;
    await eventually(async() => {
      const response = await reportClient.getReport(systemToken(), spanConfig.organization_id, moment.now());
      expect(response.statusCode).to.be.equal(httpStatus.OK);
      initialReport = response.body;
    });

    log('Sending start event to sampler ...');
    const startTimestamp = moment.now();
    await receiverClient.startSampling(eventBuilder.createStartEvent(startTimestamp));

    log('Sending stop event to sampler ...');
    const stopTimestamp = moment.utc(startTimestamp).add(1, 'millisecond').valueOf();
    await receiverClient.stopSampling(eventBuilder.createStopEvent(stopTimestamp));

    log('Getting final report ...');
    await eventually(async () => {
      // use moment.now() to get report because aggregation step uses processed time
      let response = await reportClient.getReport(systemToken(), spanConfig.organization_id, moment.now());
      expect(response.statusCode).to.be.equal(httpStatus.OK);

      const currentReport = response.body;
      expect(getMonthlySummaryValue(currentReport)).not.to.be.equal(getMonthlySummaryValue(initialReport));
    });
  });
});
