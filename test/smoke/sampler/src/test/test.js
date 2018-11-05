'use strict';

const util = require('util');
const { omit } = require('underscore');

const { ReceiverClient, ReportingClient, ConflictError, UnprocessableEntityError } = require('abacus-api');
const debug = require('abacus-debug')('abacus-sampler-smoke-test');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');

const { env, spanConfig } = require('./config');

const systemToken = env.secured ?
  oauth.cache(env.api, env.systemClientId, env.systemClientSecret, 'abacus.usage.read abacus.usage.write') :
  undefined;
const samplerToken = env.secured ?
  oauth.cache(env.api, env.clientId, env.clientSecret, 'abacus.sampler.write') :
  undefined;

const mapping = {
  'resource_id': spanConfig.resource_id,
  'plan_id': spanConfig.plan_id,
  'metering_plan': spanConfig.metering_plan,
  'rating_plan': spanConfig.rating_plan,
  'pricing_plan': spanConfig.pricing_plan
};

const createEventBuilder = () => {
  const _getEvent = (time) => ({
    timestamp: time,
    organization_id: spanConfig.organization_id,
    space_id: spanConfig.space_id,
    consumer_id: spanConfig.consumer_id,
    resource_id: spanConfig.resource_id,
    plan_id: spanConfig.plan_id,
    resource_instance_id: spanConfig.resource_instance_id,
    measured_usage: []
  });

  return {
    createStartEvent: (time) => _getEvent(time),
    createStopEvent: (time) => omit(_getEvent(time), 'measured_usage')
  };
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
    .summary;
};

const startTokens = async() => {
  const startSystemToken = util.promisify(systemToken.start);
  const startSamplerToken = util.promisify(samplerToken.start);

  await startSystemToken();
  await startSamplerToken();
};

const getToken = (token) => env.secured ? token() : undefined;

describe('Sampler smoke test', function() {
  let receiverClient;
  let reportingClient;
  let eventBuilder;

  this.timeout(env.totalTimeout);
  setEventuallyPollingInterval(env.pollInterval);
  setEventuallyTimeout(env.totalTimeout);

  const createMappingGracefully = async (receiverClient, mapping) => {
    try {
      await receiverClient.createMappings(mapping);
    } catch(e) {
      expect(e.message).to.equal(new ConflictError().message);
    }
  };

  const stopSamplingGracefully = async (receiverClient, event) => {
    try {
      await receiverClient.stopSampling(event);
    } catch(e) {
      expect(e.message).to.equal(new UnprocessableEntityError().message);
    }
  };

  before(async() => {
    if(env.secured)
      await startTokens();

    receiverClient = new ReceiverClient(env.receiverUrl, { getHeader: () => getToken(samplerToken) }, env.skipSSL);
    reportingClient = new ReportingClient(env.reportingUrl, { getHeader: () => getToken(systemToken) }, env.skipSSL);
    eventBuilder = createEventBuilder();
  });

  beforeEach(async() => {
    debug('Creating services mappings ...');
    await createMappingGracefully(receiverClient, mapping);

    debug('Cleaning up in case of previous test error ...');
    await stopSamplingGracefully(receiverClient, eventBuilder.createStopEvent(moment.now()));
  });

  afterEach(async() => {
    debug('Ensure sampling is stopped ...');
    await stopSamplingGracefully(receiverClient, eventBuilder.createStopEvent(moment.now()));
  });

  context('when sampling usage', () => {
    let initialReport;

    beforeEach(async() => {
      debug('Getting initial report ...');
      await eventually(async() => {
        initialReport = await reportingClient.getReport(spanConfig.organization_id, moment.now());
      });

      debug('Sending start event to sampler ...');
      const startTimestamp = moment.now();
      await receiverClient.startSampling(eventBuilder.createStartEvent(startTimestamp));

      debug('Sending stop event to sampler ...');
      const stopTimestamp = moment.utc(startTimestamp).add(1, 'millisecond').valueOf();
      await receiverClient.stopSampling(eventBuilder.createStopEvent(stopTimestamp));
    });

    it('reports discrete usage to Abacus', async () => {
      await eventually(async () => {
        // To get report we use moment.now(), because it is increasing for each eventually iteration.
        // We do that, because aggregation step uses processed (seqid) time instead of document end time.
        const reportTimestamp = moment.now();

        debug('Getting final report for timestamp %d ...', reportTimestamp);

        const currentReport = await reportingClient.getReport(spanConfig.organization_id, reportTimestamp);
        expect(getMonthlySummaryValue(currentReport)).not.to.equal(getMonthlySummaryValue(initialReport));
      });
    });
  });
});
