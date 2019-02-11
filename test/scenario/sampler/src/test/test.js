'use strict';

const { omit } = require('underscore');
const util = require('util');
const uuid = require('uuid');

const debug = require('abacus-debug')('abacus-sampler-scenario-test');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const { ReceiverClient, ReportingClient, UnprocessableEntityError, ConflictError } = require('abacus-api-clients');

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
    getCurrentMonthSummary: () => _getMonthlySummaryValue(_currentMonthIndex)
  };
};

describe('@sampler scenario test', function() {
  let receiverClient;
  let reportingClient;
  let eventBuilder;

  const sixUsageHours = 6;
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

  beforeEach(async() => {
    if(env.secured)
      await startTokens();

    receiverClient = new ReceiverClient(env.receiverUrl, {
      authHeaderProvider: {
        getHeader: () => getToken(samplerToken)
      },
      skipSslValidation: env.skipSSL
    });
    reportingClient = new ReportingClient(env.reportingUrl, {
      authHeaderProvider: {
        getHeader: () => getToken(systemToken)
      },
      skipSslValidation: env.skipSSL
    });
    eventBuilder = createEventBuilder();
  });

  afterEach(async() => {
    await stopSamplingGracefully(receiverClient, eventBuilder.createStopEvent(target, moment.now()));
  });

  context('when sampling usage', () => {
    beforeEach(async() => {
      debug('Creating services mappings ...');
      await createMappingGracefully(receiverClient, mapping);

      debug('Sending start event to sampler ...');
      const startTimestamp = moment.utc().startOf('month').add(12, 'hours').valueOf();
      await receiverClient.startSampling(eventBuilder.createStartEvent(target, startTimestamp));

      debug('Sending stop event to sampler ...');
      const stopTimestamp = moment.utc(startTimestamp).add(6, 'hours').valueOf();
      await receiverClient.stopSampling(eventBuilder.createStopEvent(target, stopTimestamp));
    });

    it('reports discrete usage to Abacus', async () => {
      await eventually(async () => {
        // To get report we use moment.now(), because it is increasing for each eventually iteration.
        // We do that, because aggregation step uses processed (seqid) time instead of document end time.
        const reportTimestamp = moment.now();

        debug('Getting final report for timestamp %d ...', reportTimestamp);

        const currentReport = await reportingClient.getReport(target.organization_id, reportTimestamp);
        const reportParser = createReportParser(currentReport);
        const totalSummary = reportParser.getCurrentMonthSummary();
        expect(totalSummary).to.be.equal(sixUsageHours);
      });
    });
  });
});
