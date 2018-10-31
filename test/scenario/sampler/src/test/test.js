'use strict';

const uuid = require('uuid');
const util = require('util');
const { omit } = require('underscore');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const { ReceiverClient, ReportingClient, UnprocessableEntityError } = require('abacus-api');

const { env } = require('./env-config');

const systemToken = env.secured ?
  oauth.cache(env.api, env.systemClientId, env.systemClientSecret, 'abacus.usage.read abacus.usage.write') :
  undefined;
const samplerToken = env.secured ?
  oauth.cache(env.api, env.clientId, env.clientSecret, 'abacus.sampler.write') :
  undefined;

const startTokens = async() => {
  const startSystemToken = util.promisify(systemToken.start);
  const startSamplerToken = util.promisify(samplerToken.start);

  await startSystemToken();
  await startSamplerToken();
};

const getToken = (token) => env.secured ? token() : undefined;

const createEventBuilder = () => {
  const _getEvent = (target, timestamp) => ({
    timestamp,
    organization_id: target.organization_id,
    space_id: target.space_id,
    consumer_id: target.consumer_id,
    resource_id: target.resource_id,
    plan_id: target.plan_id,
    resource_instance_id: target.resource_instance_id,
    measured_usage: []
  });

  return {
    createStartEvent: (target, timestamp) => _getEvent(target, timestamp),
    createStopEvent: (target, timestamp) => omit(_getEvent(target, timestamp), 'measured_usage')
  };
};

const createReportParser = (report) => {
  const _currentMonthIndex = 0;
  const _prevMonthIndex = 1;

  const _getMonthlySummaryValue = (monthIndex) => {
    const resourceIndex = 0;
    const aggrUsageMetricIndex = 0;
    const monthWindowIndex = 4;
    const parsedReport = JSON.parse(report);

    const monthWindow = parsedReport
      .resources[resourceIndex]
      .aggregated_usage[aggrUsageMetricIndex]
      .windows[monthWindowIndex][monthIndex];

    return monthWindow ? monthWindow.summary : 0;
  };

  return {
    getCurrentMonthSummary: () => _getMonthlySummaryValue(_currentMonthIndex),
    getPrevMonthSummary: () => _getMonthlySummaryValue(_prevMonthIndex)
  };
};

const log = (msg) => console.log(`${moment.utc().toDate()}: ${msg}`);

describe('Sampler scenario test', function() {
  let receiverClient;
  let reportingClient;
  let eventBuilder;

  const twentyFourUsageHours = 24;
  const resourceId = 'sample-resource';
  const planId = 'sample-plan';
  const target = {
    organization_id: uuid.v4(),
    space_id: uuid.v4(),
    consumer_id: uuid.v4(),
    resource_id: resourceId,
    plan_id: planId,
    resource_instance_id: uuid.v4()
  };
  const mapping = {
    'resource_id': resourceId,
    'plan_id': planId,
    'metering_plan': 'standard-services-hours',
    'rating_plan': 'standard-services-hours',
    'pricing_plan': 'standard-services-hours'
  };

  this.timeout(env.totalTimeout);
  setEventuallyPollingInterval(env.pollInterval);
  setEventuallyTimeout(env.totalTimeout);

  beforeEach(async() => {
    if(env.secured)
      await startTokens();

    receiverClient = new ReceiverClient(env.receiverUrl, { getHeader: () => getToken(samplerToken) }, env.skipSSL);
    reportingClient = new ReportingClient(env.reportingUrl, { getHeader: () => getToken(systemToken) }, env.skipSSL);
    eventBuilder = createEventBuilder();
  });

  afterEach(async() => {
    try {
      await receiverClient.stopSampling(eventBuilder.createStopEvent(target, moment.now()));
    } catch (e) {
      expect(e.message).to.equal(new UnprocessableEntityError().message);
    }
  });

  it('samples usage to Abacus successfully', async () => {
    log('Creating services mappings ...');
    await receiverClient.createMappings(mapping);

    log('Sending start event to sampler ...');
    const startTimestamp = moment.utc().subtract(2, 'days').valueOf();
    await receiverClient.startSampling(eventBuilder.createStartEvent(target, startTimestamp));

    log('Sending stop event to sampler ...');
    const stopTimestamp = moment.utc(startTimestamp).add(1, 'day').valueOf();
    await receiverClient.stopSampling(eventBuilder.createStopEvent(target, stopTimestamp));

    log('Getting final report ...');
    await eventually(async () => {
      // use moment.now() to get report because aggregation step uses processed time
      const currentReport = await reportingClient.getReport(target.organization_id, moment.now());
      const reportParser = createReportParser(currentReport);
      const totalSummary = reportParser.getCurrentMonthSummary() + reportParser.getPrevMonthSummary();
      expect(totalSummary).to.be.equal(twentyFourUsageHours);
    });
  });
});
