'use strict';

const moment = require('abacus-moment');
const oauth = require('abacus-oauth');

const util = require('util');
const request = require('request');
const { omit } = require('underscore');
const httpStatus = require('http-status-codes');

const doPost = util.promisify(request.post);
const doGet = util.promisify(request.get);


const testEnv = {
  api: process.env.CF_API_URI,
  receiverUrl: process.env.RECEIVER_URL || 'http://localhost:7070',
  reportingUrl: process.env.REPORTING_URL || 'http://localhost:9088',
  skipSSL: process.env.SKIP_SSL_VALIDATION || false,
  // secured: process.env.SECURED === 'true', // ? is it nessasary,
  clientId: process.env.SAMPLER_CLIENT_ID,
  clientSecret: process.env.SAMPLER_CLIENT_SECRET,
  sysClientId: process.env.SYSTEM_CLIENT_ID,
  sysClientSecret: process.env.SYSTEM_CLIENT_SECRET,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 60000,
  pollInterval: process.env.POLL_INTERVAL || 300
};

const orgId = '62332d73-d1ce-4da1-8455-64cc0f7e0b2e';
const eventBuilder = () => {
  const getEvent = (time) => ({
    timestamp: time,
    organization_id: orgId,
    space_id: 'bcedeb4a-641e-4d80-9e35-435cbaf79d5c',
    consumer_id: '92d9ef8b-fd71-46d7-b460-e64f44e18f18',
    resource_id: 'sampler-postgresql',
    plan_id: 'v9.4-large',
    resource_instance_id: '2249be66-9f05-4525-a09e-955ae2ab53c1',
    measured_usage: []
  });

  return {
    startEvent: (time) => getEvent(time),
    stopEvent: (time) => omit(getEvent(time), 'measured_usage')
  };
};

const getReport = async(token, time) => {
  const response = await doGet(`/v1/metering/organizations/${orgId}/aggregated/usage/${time}`, {
    baseUrl: testEnv.reportingUrl,
    headers: {
      authorization: token()
    },
    rejectUnauthorized: !testEnv.skipSSL
  });
  expect(response.statusCode).to.be.equal(httpStatus.OK, 'Did not get report');
  return response.body;
};

const postMappings = async(token) => {
  const response = await doPost('/v1/mappings', {
    baseUrl: testEnv.receiverUrl,
    json: {
      'resource_id': 'sampler-postgresql',
      'plan_id': 'v9.4-large',
      'metering_plan': 'standard-services-hours',
      'rating_plan': 'standard-services-hours',
      'pricing_plan': 'standard-services-hours'
    },
    headers: {
      authorization: token()
    },
    rejectUnauthorized: !testEnv.skipSSL
  });
    // TODO: discuss this and possibly fix
  expect(response.statusCode).to.be.oneOf([httpStatus.CREATED, httpStatus.CONFLICT]);
};

const postEvent = async(token, endpoint, event) => {
  return await doPost(endpoint, {
    baseUrl: testEnv.receiverUrl,
    json: event,
    headers: {
      authorization: token()
    },
    rejectUnauthorized: !testEnv.skipSSL
  });
};

const sendStart = async(token, event) => {
  const response = await postEvent(token, '/v1/events/start' , event);
  expect(response.statusCode).to.be.equal(httpStatus.CREATED, 'Start event not accepted by receiver!');
};

const sendStop = async(token, event) => {
  const response = await postEvent(token, '/v1/events/stop' , event);
  expect(response.statusCode).to.be.equal(httpStatus.CREATED, 'Stop event not accepted by receiver!');
};

const tryToStop = async(token, event) => {
  const response = await postEvent(token, '/v1/events/stop' , event);
  expect(response.statusCode).to.be.oneOf([httpStatus.CREATED, httpStatus.UNPROCESSABLE_ENTITY], 'Stop event not accepted by receiver!');
};

const getMonthlySummaryValue = (report) => {
  const resourceIndex = 0;
  const aggrUsageMetricIndex = 0;
  const monthWindowIndex = 4;
  const currentMonthIndex = 0;
  return JSON.parse(report)
    .resources[resourceIndex]
    .aggregated_usage[aggrUsageMetricIndex]
    .windows[monthWindowIndex][currentMonthIndex]
    .quantity;
};


describe('Sampler smoke test', () => {

  let eventToken;
  let reportToken;
  let initialReport;

  setEventuallyPollingInterval(testEnv.pollInterval);
  setEventuallyTimeout(testEnv.totalTimeout);


  beforeEach(async() => {

    console.log('\n%s: Starting tokens ...', moment.utc().toDate());
    // TODO: if secured check
    reportToken = oauth.cache(testEnv.api, testEnv.sysClientId, testEnv.sysClientSecret, 'abacus.usage.read abacus.usage.write');
    await util.promisify(reportToken.start)();

    eventToken = oauth.cache(testEnv.api, testEnv.clientId, testEnv.clientSecret, 'abacus.sampler.usage.write');
    await util.promisify(eventToken.start)();

    console.log('\nPosting services mappings ...');
    await postMappings(eventToken);

    console.log('\n%s: Stopping eventual previous events before test execution ...', moment.utc().toDate());
    const stopTimestamp = moment.utc().subtract(26, 'hours').valueOf();
    const stopEvent = eventBuilder().stopEvent(stopTimestamp);
    await tryToStop(eventToken, stopEvent);

    console.log('\n%s: Retrieving initial report ...', moment.utc().toDate());
    await eventually(async () => {
      initialReport = await getReport(reportToken, moment.now());
    });
    console.log('initial report: %o', getMonthlySummaryValue(initialReport));

  });

  afterEach(async() => {
    const stopTimestamp = moment.utc().subtract(26, 'hours').valueOf();
    const stopEvent = eventBuilder().stopEvent(stopTimestamp);
    await tryToStop(eventToken, stopEvent);
  });

  it('should receive sampler usage and Abacus processes it successfuly', async () => {
    // TODO:
    // readme
    // corner cases with dates
    // token start

    console.log('\n%s: Posting start event ...', moment.utc().toDate());
    const startTimestamp = moment.utc().subtract(26 + 24, 'hours').valueOf();
    const startEvent = eventBuilder().startEvent(startTimestamp);
    await sendStart(eventToken, startEvent);

    console.log('\n%s: Posting stop event ...', moment.utc().toDate());
    const stopTimestamp = moment.utc().subtract(26, 'hours').valueOf();
    const stopEvent = eventBuilder().stopEvent(stopTimestamp);
    await sendStop(eventToken, stopEvent);

    await eventually(async () => {
      const report = await getReport(reportToken, moment.now());
      expect(getMonthlySummaryValue(report)).not.to.be.equal(getMonthlySummaryValue(initialReport));
      console.log('after report: %o', getMonthlySummaryValue(report));
    });

  });
});
