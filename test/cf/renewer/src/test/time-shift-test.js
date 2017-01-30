'use strict';

// The test simulates a stream of usage events, submitted in the previous
// month by the bridge. The renewer should transfer the same usage to the
// current and next months.
//
// TODO: slack window context: end of month, start of next month

const commander = require('commander');
const cp = require('child_process');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-renewer-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-oauth');

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
    sub: 'abacus-cf-bridge',
    authorities: [
      'abacus.usage.linux-container.write',
      'abacus.usage.linux-container.read'
    ],
    scope: [
      'abacus.usage.linux-container.read',
      'abacus.usage.linux-container.write'
    ],
    client_id: 'abacus-cf-bridge',
    cid: 'abacus-cf-bridge',
    azp: 'abacus-cf-bridge',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-bridge',
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
    sub: 'abacus-cf-bridge',
    authorities: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    scope: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    client_id: 'abacus-cf-bridge',
    cid: 'abacus-cf-bridge',
    azp: 'abacus-cf-bridge',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-bridge',
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
const startOfNextMonth = moment().add(1, 'months').startOf('month').valueOf();
const afterTwoMonths = moment().add(2, 'months').startOf('month').valueOf();
const afterThreeMonths = moment().add(3, 'months').startOf('month').valueOf();
delete require.cache[require.resolve('abacus-moment')];

const deleteAllAbacusModules = () => {
  const pathToNodeModules = path.normalize(path.format({
    dir: __dirname,
    base: '../../node_modules/abacus-'
  }));
  for (let moduleKey of Object.keys(require.cache))
    if (moduleKey.startsWith(pathToNodeModules)) {
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

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const start = (module) => {
  debug('Starting %s in directory %s', module, moduleDir(module));
  const c = cp.spawn('npm', ['run', 'start'], {
    cwd: moduleDir(module),
    env: clone(process.env)
  });

  // Add listeners to stdout, stderr and exit message and forward the
  // messages to debug logs
  c.stdout.on('data', (data) => process.stdout.write(data));
  c.stderr.on('data', (data) => process.stderr.write(data));
  c.on('exit', (code) => debug('Module %s started with code %d',
    module, code));
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

  const waitForStart = (url, opts, startTimeout, done) => {
    request.waitFor(url, opts, startTimeout, (err) => {
      // Failed to ping component before timing out
      if (err) throw err;

      done();
    });
  };

  const modifyEvents = (responseBody) => {
    const startTime = moment.now() - twentySecondsInMilliseconds;
    for(let resource of responseBody.resources) {
      resource.metadata.created_at =
        moment(startTime + resource.metadata.created_at).toISOString();
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
    // Load moment with offset
    moment = require('abacus-moment');

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
    start('abacus-eureka-plugin');
    start('abacus-provisioning-plugin');
    start('abacus-account-plugin');
    start('abacus-usage-collector');
    start('abacus-usage-meter');
    start('abacus-usage-accumulator');
    start('abacus-usage-aggregator');
    start('abacus-usage-reporting');
    start('abacus-cf-bridge');

    waitForStart('http://localhost:9080/batch', {}, startTimeout, () =>
      waitForStart('http://localhost:9500/v1/cf/bridge',
        {}, startTimeout, done));
  };

  const checkMonthWindow = (windowName, monthIndex, usage, level) => {
    const monthWindow = usage.windows[timeWindows.month][monthIndex];
    expect(monthWindow).to.not.equal(undefined);

    if (level !== 'resource') {
      expect(monthWindow).to.contain.all.keys('quantity', 'charge');
      debug('%s window; Expected: consuming=%d, charge>0; ' +
        'Actual: consuming=%d, charge=%d; Month window: %o',
        windowName, expectedConsuming, monthWindow.quantity.consuming,
        monthWindow.charge, monthWindow);
      expect(monthWindow.quantity.consuming).to.equal(expectedConsuming);
    }
    else
      debug('%s window; Expected:  charge>0; ' +
        'Actual: charge=%o; Month window: %o',
        windowName, monthWindow.charge, monthWindow);

    expect(monthWindow.charge).not.to.equal(undefined);
    expect(monthWindow).to.contain.all.keys('charge');
    expect(monthWindow.charge).to.be.above(0);
  };

  const checkThisMonth = (windowName, usage, level) => {
    checkMonthWindow(windowName, 0, usage, level);
  };

  const checkThisAndPreviousMonths = (windowName, usage, level) => {
    checkMonthWindow(windowName, 0, usage, level);
    checkMonthWindow(windowName, 1, usage, level);
  };

  const checkReport = (checkFn, cb) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: testDataOrgGuid,
        headers: {
          authorization: 'bearer ' + signedResourceToken
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

  const poll = (checkFn, done, timeout = 1000, interval = 100) => {
    const startTimestamp = moment.now();

    const doneCallback = (err) => {
      if (!err) {
        debug('Expectation met');
        setImmediate(() => done());
        return;
      }

      if (moment.now() - startTimestamp > timeout) {
        debug('Expectation not met for %d ms. Error: %o', timeout, err);
        setImmediate(() => done(new Error(err)));
      }
      else
        setTimeout(() => {
          debug('Checking report after >= %d ms...', interval);
          checkReport(checkFn, doneCallback);
        }, interval);
    };

    debug('Checking report for the first time...');
    checkReport(checkFn, doneCallback);
  };

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
    routes.get('/oauth/token', (request, response) => {
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
    process.env.CF_CLIENT_ID = 'abacus-cf-bridge';
    process.env.CF_CLIENT_SECRET = 'secret';
    process.env.CLIENT_ID = 'abacus-linux-container';
    process.env.CLIENT_SECRET = 'secret';
    process.env.JWTKEY = tokenSecret;
    process.env.JWTALGO = tokenAlgorithm;

    // Set slack window to 5 days
    process.env.SLACK = '5D';

    // Trigger renewer every 10 seconds
    process.env.RETRY_INTERVAL = 10000;

    // Disable wait for correct app-event ordering
    process.env.GUID_MIN_AGE = twentySecondsInMilliseconds;
  });

  afterEach((done) => {
    let counter = 10;
    const finishCb = (module, code) => {
      counter--;
      debug('Module %s exited with code %d. Left %d modules',
        module, code, counter);
      if (counter === 0) {
        debug('All modules stopped. Exiting test');
        done();
      }
    };

    const stop = (module, cb) => {
      debug('Stopping %s in directory %s', module, moduleDir(module));
      const c = cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });

      // Add listeners to stdout, stderr and exit message and forward the
      // messages to debug logs
      c.stdout.on('data', (data) => process.stdout.write(data));
      c.stderr.on('data', (data) => process.stderr.write(data));
      c.on('exit', (code) => cb(module, code));
    };

    stop('abacus-cf-renewer', finishCb);
    stop('abacus-cf-bridge', finishCb);
    stop('abacus-usage-reporting', finishCb);
    stop('abacus-usage-aggregator', finishCb);
    stop('abacus-usage-accumulator', finishCb);
    stop('abacus-usage-meter', finishCb);
    stop('abacus-usage-collector', finishCb);
    stop('abacus-account-plugin', finishCb);
    stop('abacus-provisioning-plugin', finishCb);
    stop('abacus-eureka-plugin', finishCb);

    if (server)
      server.close();

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
  });

  context('start of next month', () => {

    beforeEach(() => {
      // Shift time 1 month, 2 days and 3 hours
      const offset = moment(startOfNextMonth).add(2, 'days').add(3, 'hours').
        diff(moment.now());
      process.env.ABACUS_TIME_OFFSET = offset;
      debug('Time offset set to %d (%s)',
        offset, moment.duration(offset).humanize());
    });

    context('on the first run', () => {
      beforeEach((done) => {
        // 1 space with:
        //   37 apps consuming 512 MB
        //   1 app using 4 GB
        // total: 22.5 GB
        numberOfSpaces = 1;
        expectedConsuming = 22.5;

        buildAppUsageEvents();
        startAbacus(done);
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        let startWaitTime = moment.now();
        start('abacus-cf-renewer');
        waitForStart('http://localhost:9501/v1/cf/renewer', {},
          startTimeout, () => poll(checkThisMonth, done,
            totalTimeout - (moment.now() - startWaitTime), 1000)
        );
      });
    });

    context('on the second run', () => {
      beforeEach((done) => {
        // 2 spaces with:
        //   37 apps consuming 512 MB
        //   1 app using 4 GB
        // total: 2 x 22.5 = 45 GB
        numberOfSpaces = 2;
        expectedConsuming = 45;

        buildAppUsageEvents();
        startAbacus(done);
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        let startWaitTime = moment.now();
        start('abacus-cf-renewer');
        waitForStart('http://localhost:9501/v1/cf/renewer', {},
          startTimeout, () => poll(checkThisMonth, done,
            totalTimeout - (moment.now() - startWaitTime), 1000)
        );
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
      const offset = moment(afterTwoMonths).add(2, 'days').add(3, 'hours').
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
      start('abacus-cf-renewer');
      waitForStart('http://localhost:9501/v1/cf/renewer', {},
        startTimeout, () => poll(checkThisAndPreviousMonths, done,
          totalTimeout - (moment.now() - startWaitTime), 1000)
      );
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
      const offset = moment(afterThreeMonths).add(2, 'days').add(3, 'hours').
        diff(moment.now());
      process.env.ABACUS_TIME_OFFSET = offset;
      debug('Time offset set to %d (%s)',
        offset, moment.duration(offset).humanize());

      startAbacus(done);
    });

    it('transfers the usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      let startWaitTime = moment.now();
      start('abacus-cf-renewer');
      waitForStart('http://localhost:9501/v1/cf/renewer', {},
        startTimeout, () => poll(checkThisAndPreviousMonths, done,
          totalTimeout - (moment.now() - startWaitTime), 1000)
      );
    });
  });

});
