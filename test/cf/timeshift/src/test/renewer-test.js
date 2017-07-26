'use strict';

//
// The test simulates a stream of usage events, submitted in the previous
// month by the bridge. The renewer should transfer the same usage to the
// current and next months.
//

const commander = require('commander');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const util = require('util');
const npm = require('abacus-npm');

const _ = require('underscore');
const clone = _.clone;
// const npm = require('abacus-npm');

const client = require('abacus-client');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-renewer-time-shift-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-renewer-time-shift-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-renewer-time-shift-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-renewer-time-shift-itest-oauth');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-collector-itest');
commander
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 100000;

// This test timeout
const totalTimeout = commander.totalTimeout || 200000;

// Token setup
const tokenSecret = 'secret';
const tokenAlgorithm = 'HS256';
const resourceToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: '254abca5-1c25-40c5-99d7-2cc641791517',
    sub: 'abacus-cf-applications',
    authorities: [
      'abacus.usage.linux-container.write',
      'abacus.usage.linux-container.read'
    ],
    scope: [
      'abacus.usage.linux-container.read',
      'abacus.usage.linux-container.write'
    ],
    client_id: 'abacus-cf-applications',
    cid: 'abacus-cf-applications',
    azp: 'abacus-cf-applications',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-applications',
      'abacus.usage.linux-container'
    ]
  },
  signature: 'irxoV230hkDJenXoTSHQFfqzoUl353lS2URo1fJm21Y'
};
const systemToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: '254abca5-1c25-40c5-99d7-2cc641791517',
    sub: 'abacus-cf-applications',
    authorities: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    scope: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    client_id: 'abacus-cf-applications',
    cid: 'abacus-cf-applications',
    azp: 'abacus-cf-applications',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-applications',
      'abacus.usage'
    ]
  },
  signature: 'OVNTKTvu-yHI6QXmYxtPeJZofNddX36Mx1q4PDWuYQE'
};
const signedResourceToken = jwt.sign(resourceToken.payload, tokenSecret, {
  expiresIn: 43200
});
const signedSystemToken = jwt.sign(systemToken.payload, tokenSecret, {
  expiresIn: 43200
});

// time constants
const twentySecondsInMilliseconds = 20 * 1000;

// calculate the time according to the actual Data without offset
let moment = require('abacus-moment');
const startOfNextMonth = moment.utc().add(1, 'months').startOf('month')
  .valueOf();
const afterTwoMonths = moment.utc().add(2, 'months').startOf('month')
  .valueOf();
const afterThreeMonths = moment.utc().add(3, 'months').startOf('month')
  .valueOf();

const deleteAllAbacusModules = () => {
  for (let moduleKey of Object.keys(require.cache))
    if (moduleKey.includes('/node_modules/abacus-')) {
      delete require.cache[moduleKey];
      debug('Deleted module %s from require cache', moduleKey);
    }
};

const timeWindows = {
  'second' : 0,
  'minute' : 1,
  'hour'   : 2,
  'day'    : 3,
  'month'  : 4
};

const runWithPersistentDB = process.env.DB ? describe : describe.skip;

runWithPersistentDB('abacus-cf-renewer time shift', () => {
  // mocked responses
  let server;
  let serverPort;

  // set by tests
  let noUsage;
  let expectedConsuming;
  let numberOfSpaces;

  // usage events
  let appUsageEvents;
  let lastEventGuid;
  let testDataOrgGuid;

  // modules
  let express;
  let request;
  let router;

  const modifyEvents = (responseBody) => {
    const startTime = moment.now() - twentySecondsInMilliseconds;
    for(let resource of responseBody.resources) {
      resource.metadata.created_at =
        moment.utc(startTime + resource.metadata.created_at).toISOString();
      if (numberOfSpaces) {
        const suffix = '-' + numberOfSpaces;
        resource.entity.space_guid = resource.entity.space_guid + suffix;
        resource.entity.app_guid = resource.entity.app_guid + suffix;
        resource.metadata.guid = resource.metadata.guid + suffix;
        resource.metadata.url = resource.metadata.url + suffix;
      }
    }

    return responseBody;
  };

  const buildAppUsageEvents = () => {
    deleteAllAbacusModules();

    // Load moment with offset
    moment = require('abacus-moment');
    debug('Time now is %s', moment.utc().format());

    const pathToEventsFile = path.format({
      dir: __dirname,
      base: 'appUsageEvents.json'
    });

    const mockedEvents =
      modifyEvents(JSON.parse(fs.readFileSync(pathToEventsFile, 'utf-8')));
    appUsageEvents = noUsage ? {
      total_results: 0,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: []
    } : mockedEvents;

    const numberOfEvents = appUsageEvents.resources.length;
    debug('Built %d events', numberOfEvents);

    lastEventGuid = noUsage ? undefined :
      appUsageEvents.resources[numberOfEvents - 1].metadata.guid;

    testDataOrgGuid = mockedEvents.resources[0].entity.org_guid;
    debug('Will check for usage for org %s', testDataOrgGuid);
  };

  const startAbacus = (done) => {
    npm.startModules([
      npm.modules.eurekaPlugin,
      npm.modules.provisioningPlugin,
      npm.modules.accountPlugin,
      npm.modules.collector,
      npm.modules.meter,
      npm.modules.accumulator,
      npm.modules.aggregator,
      npm.modules.reporting
    ], () => {
      debug('Waiting for collector ...');
      request.waitFor('http://localhost:9080/batch', {}, 
        startTimeout, (err) => {
          if (err)
            done(err);

          npm.startModules([
            npm.modules.renewer,
            npm.modules.applications
          ], done);
        });
    });
  };

  const checkMonthWindow = (windowName, monthIndex, usage, level) => {
    const monthWindow = usage.windows[timeWindows.month][monthIndex];
    expect(monthWindow).to.not.equal(undefined);

    if (level !== 'resource') {
      expect(monthWindow).to.contain.all.keys('quantity', 'charge');
      debug('%s; Expected: consuming=%d, charge>0; ' +
        'Actual: consuming=%d, charge=%d; Month window: %o',
        windowName, expectedConsuming, monthWindow.quantity.consuming,
        monthWindow.charge, monthWindow);
      expect(monthWindow.quantity.consuming).to.equal(expectedConsuming);
    }
    else
      debug('%s; Expected:  charge>0; ' +
        'Actual: charge=%o; Month window: %o',
        windowName, monthWindow.charge, monthWindow);

    expect(monthWindow.charge).not.to.equal(undefined);
    expect(monthWindow).to.contain.all.keys('charge');
    expect(monthWindow.charge).to.be.above(0);
  };

  const checkThisMonth = (windowName, usage, level) => {
    checkMonthWindow(windowName + ' for this month', 0, usage, level);
  };

  const checkThisAndPreviousMonths = (windowName, usage, level) => {
    checkMonthWindow(windowName + ' for this month', 0, usage, level);
    checkMonthWindow(windowName + ' for last month', 0, usage, level);
  };

  const checkReport = (checkFn, cb) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: testDataOrgGuid,
        headers: {
          authorization: 'bearer ' + signedSystemToken
        }
      },
      (error, response) => {
        try {
          expect(error).to.equal(undefined);

          expect(response.body).to.contain.all.keys('resources', 'spaces');
          const resources = response.body.resources;
          expect(resources.length).to.equal(1);
          expect(response.body.spaces.length).to.equal(numberOfSpaces);

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkFn('Plans aggregated usage', planUsage);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkFn('Aggregated usage', aggregatedUsage, 'resource');

          resultDebug('All usage report checks are successful for: %s',
            JSON.stringify(response.body, null, 2));

          cb();
        }
        catch (e) {
          const message = util.format('Check failed with %s.\n' +
            'Usage report:\n', e.stack,
            response ? JSON.stringify(response.body, null, 2) : undefined);
          responseDebug(message);
          cb(new Error(message), e);
        }
      });
  };

  const pollOptions = (component, port, checkFn, timeout = totalTimeout) => ({
    component: component,
    p: port,
    checkFn: checkFn,
    startTimeout: startTimeout,
    totalTimeout: timeout
  });

  before((done) => {
    const dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB, /^abacus-/, done);
  });

  beforeEach(() => {
    deleteAllAbacusModules();

    express = require('abacus-express');
    request = require('abacus-request');
    router = require('abacus-router');

    const app = express();
    const routes = router();
    routes.get('/v2/app_usage_events', (request, response) => {
      if (noUsage || request.query.after_guid === lastEventGuid) {
        debug('Returning empty list of usage events');
        response.status(200).send({
          total_results: 0,
          total_pages: 0,
          prev_url: null,
          next_url: null,
          resources: []
        });
        return;
      }

      response.status(200).send(appUsageEvents);
    });
    routes.get('/v2/info', (request, response) => {
      oAuthDebug('Requested API info');
      response.status(200).send({
        token_endpoint: 'http://localhost:' + serverPort
      });
    });
    routes.post('/oauth/token', (request, response) => {
      oAuthDebug('Requested oAuth token with %j', request.query);
      const scope = request.query.scope;
      const containerToken = scope && scope.indexOf('container') > 0;
      response.status(200).send({
        token_type: 'bearer',
        access_token: containerToken ? signedResourceToken : signedSystemToken,
        expires_in: 100000,
        scope: scope ? scope.split(' ') : '',
        authorities: scope ? scope.split(' ') : '',
        jti: '254abca5-1c25-40c5-99d7-2cc641791517'
      });
    });
    app.use(routes);
    app.use(router.batch(routes));
    server = app.listen(0);
    serverPort = server.address().port;
    debug('Test resources server listening on port %d', serverPort);

    // Set environment variables
    process.env.API = 'http://localhost:' + serverPort;
    process.env.AUTH_SERVER = 'http://localhost:' + serverPort;
    process.env.CF_CLIENT_ID = 'abacus-cf-applications';
    process.env.CF_CLIENT_SECRET = 'secret';
    process.env.CLIENT_ID = 'abacus-linux-container';
    process.env.CLIENT_SECRET = 'secret';
    process.env.JWTKEY = tokenSecret;
    process.env.JWTALGO = tokenAlgorithm;

    // Set slack window to 5 days
    process.env.SLACK = '5D';

    // Trigger renewer every 5 seconds
    process.env.RETRY_INTERVAL = 5000;

    // Disable wait for correct app-event ordering
    process.env.GUID_MIN_AGE = twentySecondsInMilliseconds;
  });

  afterEach((done) => {
    delete process.env.ABACUS_TIME_OFFSET;
    delete process.env.API;
    delete process.env.AUTH_SERVER;
    delete process.env.CF_CLIENT_ID;
    delete process.env.CF_CLIENT_SECRET;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
    delete process.env.JWTKEY;
    delete process.env.JWTALGO;
    delete process.env.SLACK;
    delete process.env.GUID_MIN_AGE;
    noUsage = false;

    if (server)
      server.close();
    npm.stopAllStarted(done);
  });

  context('next month', () => {

    context('at the start', () => {
      beforeEach((done) => {
        // 1 space with:
        //   37 apps consuming 512 MB
        //   1 app using 4 GB
        // total: 22.5 GB
        numberOfSpaces = 1;
        expectedConsuming = 22.5;

        const offset = moment.utc(startOfNextMonth).
          add(2, 'days').add(3, 'hours').diff(moment.now());
        process.env.ABACUS_TIME_OFFSET = offset;
        debug('Time offset set to %d (%s)',
          offset, moment.duration(offset).humanize());

        buildAppUsageEvents();
        startAbacus(done);
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        let startWaitTime = moment.now();
        const renewerOptions = pollOptions(
          'renewer', 9501,
          checkThisMonth,
          totalTimeout - (moment.now() - startWaitTime));
        client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
          checkReport, renewerOptions, done);
      });
    });

    context('inside slack window', () => {
      beforeEach((done) => {
        // 2 spaces with:
        //   37 apps consuming 512 MB
        //   1 app using 4 GB
        // total: 2 x 22.5 = 45 GB
        numberOfSpaces = 2;
        expectedConsuming = 45;

        const offset = moment.utc(afterTwoMonths).
          add(2, 'days').add(3, 'hours').diff(moment.now());
        process.env.ABACUS_TIME_OFFSET = offset;
        debug('Time offset set to %d (%s)',
          offset, moment.duration(offset).humanize());

        buildAppUsageEvents();
        startAbacus(done);
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        let startWaitTime = moment.now();
        const renewerOptions = pollOptions(
          'renewer', 9501,
          checkThisMonth,
          totalTimeout - (moment.now() - startWaitTime));
        client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
          checkReport, renewerOptions, done);
      });
    });

  });

  context('after 2 months', () => {

    beforeEach((done) => {
      // no new usage this month
      // from previous month we have 2 spaces with:
      //   37 apps consuming 512 MB
      //   1 app using 4 GB
      // total: 2 x 22.5 = 45 GB
      noUsage = true;
      numberOfSpaces = 2;
      expectedConsuming = 45;

      // Shift time 2 months, 2 days and 3 hours
      const offset = moment.utc(afterTwoMonths).add(2, 'days').add(3, 'hours').
        diff(moment.now());
      process.env.ABACUS_TIME_OFFSET = offset;
      debug('Time offset set to %d (%s)',
        offset, moment.duration(offset).humanize());

      buildAppUsageEvents();
      startAbacus(done);
    });

    it('transfers the usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      let startWaitTime = moment.now();
      const renewerOptions = pollOptions(
        'renewer', 9501,
        checkThisAndPreviousMonths,
        totalTimeout - (moment.now() - startWaitTime));
      client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
        checkReport, renewerOptions, done);
    });
  });

  context('after 3 months', () => {

    beforeEach((done) => {
      // no new usage this month
      // from previous months we have 2 spaces with:
      //   37 apps consuming 512 MB
      //   1 app using 4 GB
      // total: 2 x 22.5 = 45 GB
      noUsage = true;
      numberOfSpaces = 2;
      expectedConsuming = 45;

      // Shift time 3 months, 2 days and 3 hours
      const offset = moment.utc(afterThreeMonths)
        .add(2, 'days').add(3, 'hours').diff(moment.now());
      process.env.ABACUS_TIME_OFFSET = offset;
      debug('Time offset set to %d (%s)',
        offset, moment.duration(offset).humanize());

      buildAppUsageEvents();
      startAbacus(done);
    });

    it('transfers the usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      let startWaitTime = moment.now();
      const renewerOptions = pollOptions(
        'renewer', 9501,
        checkThisAndPreviousMonths,
        totalTimeout - (moment.now() - startWaitTime));
      client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
        checkReport, renewerOptions, done);
    });
  });

});
