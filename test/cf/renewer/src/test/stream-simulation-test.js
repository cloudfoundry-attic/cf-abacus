'use strict';

// The test simulates a stream of usage events, submitted in the previous
// month by the bridge. The renewer should transfer the same usage to the
// current month.
//
// To run the test:
//
//   1. Use persistent DB
//   2. Make this test exclusive by adding ".only" to the describe
//
//   # Suppose now is December 2016. Let's populate data:
//   cd workspace/cf-abacus/test/cf/renewer
//   npm install && npm run babel && npm run lint && npm run itest
//
//   # Submit usage for space with another GUID
//   npm run itest -- -s 2 -i 2
//
//   # Shift the time one month in the future. For Ubuntu:
//   timedatectl set-ntp false && timedatectl set-time "2017-01-01 23:05"
//
//   # Run renewer to check if usage is transfered in next month
//   npm run itest -- --no-usage -i 2
//
//   # Shift the time one month in the future. For Ubuntu:
//   timedatectl set-ntp false && timedatectl set-time "2017-02-01 23:05"
//
//   # Run renewer to check if usage is transfered in next month
//   npm run itest -- --no-usage -i 2
//
//
//   # !!! NOTE !!! Submitting usage in the future would fail due to different
//   # time-window quantities. Current month would have 22.5*3 GB, while the
//   # last month would be with only 22.5*2 GB
//   npm run itest -- -s 3 -i 3
//
//   # Restore the time
//   timedatectl set-ntp true
//
// TODO: DB cleanup flag
// TODO: set custom time provider (#228)
// TODO: max interval context: start of month, start of next month
// TODO: slack window context: end of month, start of next month

const commander = require('commander');
const cp = require('child_process');
const jwt = require('jsonwebtoken');
const moment = require('abacus-moment');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;

const express = require('abacus-express');
const request = require('abacus-request');
const router = require('abacus-router');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-renewer-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-oauth');

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const timeWindows = {
  'second' : 0,
  'minute' : 1,
  'hour'   : 2,
  'day'    : 3,
  'month'  : 4
};

// Checks if the difference between start and end time fall within a window
const isWithinWindow = (start, end, timeWindow) => {
  // [Second, Minute, Hour, Day, Month]
  const timescale = [1, 100, 10000, 1000000, 100000000];
  // Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
  const dateUTCNumbify = (t) => {
    const d = moment(t).valueOf();
    return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
      + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
      + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
  };

  return Math.floor(dateUTCNumbify(end) / timescale[timeWindow]) -
    Math.floor(dateUTCNumbify(start) / timescale[timeWindow]) === 0;
};

let noUsage = false;
const noUsageFn = () => {
  noUsage = true;
};

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-collector-itest');
commander
  .option('-s, --guid-suffix <suffix>',
    'guid suffix used to change event, space and app GUIDs')
  .option('-i, --invocations <number>',
    'number or test invocations', parseInt)
  .option('-u, --no-usage',
    'do not mock any usage events', noUsageFn)
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// Number of invocations
const invocations = commander.invocations || 1;

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

const twentySecondsInMilliseconds = 20 * 1000;

const modifyEvents = (responseBody) => {
  const startTime = moment.now() - twentySecondsInMilliseconds;
  for(let resource of responseBody.resources) {
    resource.metadata.created_at =
      moment(startTime + resource.metadata.created_at).toISOString();
    if (commander.guidSuffix) {
      const suffix = '-' + commander.guidSuffix;
      resource.entity.space_guid = resource.entity.space_guid + suffix;
      resource.entity.app_guid = resource.entity.app_guid + suffix;
      resource.metadata.guid = resource.metadata.guid + suffix;
      resource.metadata.url = resource.metadata.url + suffix;
    }
  }

  return responseBody;
};

const appUsageEvents = noUsage ? {
  total_results: 0,
  total_pages: 1,
  prev_url: null,
  next_url: null,
  resources: []
} : modifyEvents(require('./appUsageEvents.json'));

const numberOfEvents = appUsageEvents.resources.length;
const lastEventGuid = noUsage ? undefined :
  appUsageEvents.resources[numberOfEvents - 1].metadata.guid;

const testDataOrgGuid =
  require('./appUsageEvents.json').resources[0].entity.org_guid;

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

describe('abacus-cf-renewer stream simulation', () => {
  let server;
  let serverPort;
  let expectedConsuming;
  let submittime;

  beforeEach(() => {
    if (!process.env.DB)
      throw new Error('No persistent DB found');

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

    // Disable wait for correct app-event ordering
    process.env.GUID_MIN_AGE = twentySecondsInMilliseconds;

    start('abacus-eureka-plugin');
    start('abacus-provisioning-plugin');
    start('abacus-account-plugin');
    start('abacus-usage-collector');
    start('abacus-usage-meter');
    start('abacus-usage-accumulator');
    start('abacus-usage-aggregator');
    start('abacus-usage-reporting');

    submittime = noUsage ? moment().utc().startOf('month').valueOf() :
      moment.now();
    start('abacus-cf-bridge');
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
  });

  const checkAllTimeWindows = (usage, reporttime, checkQuantity) => {
    for (const windowType in timeWindows)
      if(isWithinWindow(submittime, reporttime, timeWindows[windowType])) {
        debug('Checking time window type: %s', windowType);
        const windowUsage = usage.windows[timeWindows[windowType]];
        expect(windowUsage[0]).to.not.equal(null);
        if(checkQuantity)
          expect(windowUsage[0].quantity.consuming).to.equal(expectedConsuming);
        expect(windowUsage[0].charge).to.be.above(0);
      }
  };

  const checkReport = (cb) => {
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
          expect(response.body.spaces.length).to.equal(invocations);
          const reporttime = moment.now();

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkAllTimeWindows(planUsage, reporttime, true);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage, reporttime, false);

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

  const poll = (fn, done, timeout = 1000, interval = 100) => {
    const startTimestamp = moment.now();

    const doneCallback = (err) => {
      if (!err) {
        debug('Expectation in %s met', fn.name);
        setImmediate(() => done());
        return;
      }

      if (moment.now() - startTimestamp > timeout) {
        debug('Expectation not met for %d ms. Error: %o', timeout, err);
        setImmediate(() => done(new Error(err)));
      }
      else
        setTimeout(() => {
          debug('Calling %s after >= %d ms...', fn.name, interval);
          fn(doneCallback, done);
        }, interval);
    };

    debug('Calling %s for the first time...', fn.name);
    fn(doneCallback, done);
  };

  const waitForStart = (component, port, done) => {
    request.waitFor('http://localhost::p/v1/cf/:component',
      { component: component, p: port },
      startTimeout, (err, uri) => {
        // Failed to ping component before timing out
        if (err) throw err;

        // Check report
        request.get(uri, {}, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);

          done();
        });
      }
    );
  };

  context('with stream of CF events', () => {
    beforeEach(() => {
      // 37 apps consuming 512 MB
      // one app using 4 GB
      // total: 22.5 GB

      // multiply by the number of text invocations
      expectedConsuming = 22.5 * invocations;
    });

    // Skipping the test until issue #228 enables time travel
    it.skip('submits usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      let startWaitTime = moment.now();
      waitForStart('bridge', 9500, () => {
        start('abacus-cf-renewer');
        waitForStart('renewer', 9501, () => {
          poll(checkReport, done,
            totalTimeout - (moment.now() - startWaitTime), 1000);
        });
      });
    });
  });
});
