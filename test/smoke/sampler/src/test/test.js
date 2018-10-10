'use strict';

const moment = require('abacus-moment');
const oauth = require('abacus-oauth');

const util = require('util');
const request = require('request');
const { omit } = require('underscore');

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
  sysClientSecret: process.env.SYSTEM_CLIENT_SECRET
};

describe('Sampler smoke test', () => {
  let eventToken;
  let reportToken;
  let initialReport;

  const orgId = '62332d73-d1ce-4da1-8455-64cc0f7e0b2e';
  const eventBuilder = (time) => {
    const event = {
      timestamp: time,
      organization_id: orgId,
      space_id: 'bcedeb4a-641e-4d80-9e35-435cbaf79d5c',
      consumer_id: '92d9ef8b-fd71-46d7-b460-e64f44e18f18',
      resource_id: 'sampler-postgresql',
      plan_id: 'v9.4-large',
      resource_instance_id: '2249be66-9f05-4525-a09e-955ae2ab53c1',
      measured_usage: []
    };

    return {
      startEvent: event,
      stopEvent: omit(event, 'measured_usage')
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
    expect(response.statusCode).to.be.equal(200, 'Did not get report');
    return response.body;
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
    expect(response.statusCode).to.be.equal(201, 'Start event not accepted by receiver!');
  };

  const sendStop = async(token, event) => {
    const response = await postEvent(token, '/v1/events/stop' , event);
    expect(response.statusCode).to.be.equal(201, 'Stop event not accepted by receiver!');
  };


  before(async() => {
    console.log('\n%s: Starting tokens ...', moment.utc().toDate());
    reportToken = oauth.cache(testEnv.api, testEnv.sysClientId, testEnv.sysClientSecret, 'abacus.usage.read abacus.usage.write');
    await util.promisify(reportToken.start)();

    eventToken = oauth.cache(testEnv.api, testEnv.clientId, testEnv.clientSecret, 'abacus.sampler.usage.write');
    await util.promisify(eventToken.start)();

    console.log('\n%s: Getting initial report ...', moment.utc().toDate());
    initialReport = await getReport(reportToken, moment.now());
    // console.log('initial report: %o', initialReport);

    // console.log('\n%s: Stopping eventual previous events before test execution ...', moment.utc().toDate());
    // await sendStop(eventToken, eventBuilder(moment.utc().subtract(26, 'hours').valueOf()).stopEvent);

    console.log('\nPosting services mappings ...');
    const res = await doPost('/v1/mappings', {
      baseUrl: testEnv.receiverUrl,
      json: {
        'resource_id': 'sampler-postgresql',
        'plan_id': 'v9.4-large',
        'metering_plan': 'standard-services-hours',
        'rating_plan': 'standard-services-hours',
        'pricing_plan': 'standard-services-hours'
      },
      headers: {
        authorization: eventToken()
      },
      rejectUnauthorized: !testEnv.skipSSL
    });

    console.log('>>>>>>>>>>>>>>>>>res.status: %s, body: %o', res.statusCode, res.body);
    expect(res.statusCode).to.be.oneOf([201, 409]);
  });

  it('should receive sampler usage and Abacus processes it successfuly', async () => {

    console.log('\n%s: Posting start event ...', moment.utc().toDate());
    await sendStart(eventToken, eventBuilder(moment.utc().subtract(26 + 24, 'hours').valueOf()).startEvent);

    console.log('\n%s: Posting stop event ...', moment.utc().toDate());
    await sendStop(eventToken, eventBuilder(moment.utc().subtract(26, 'hours').valueOf()).stopEvent);

    // wait to be processed

    console.log('\n%s: Getting final report ...', moment.utc());
    const report = await getReport(reportToken, moment.now());
    console.log('Result report: %o', report);

    // compare reports
  });
});
