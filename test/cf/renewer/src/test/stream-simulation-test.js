'use strict';

const commander = require('commander');
const cp = require('child_process');
const jwt = require('jsonwebtoken');
const moment = require('moment');
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

const twentySecondsInMilliseconds = 20 * 1000;

const fixTimes = (responseBody) => {
  const lastMonthInMilliseconds =
    moment().utc().subtract(1, 'months').valueOf();
  for(let resource of responseBody.resources)
    resource.metadata.created_at =
      new Date(lastMonthInMilliseconds +
        resource.metadata.created_at).toISOString();

  return responseBody;
};

const appUsageEvents = fixTimes(require('./appUsageEvents.json'));
const testDataOrgGuid = appUsageEvents.resources[0].entity.org_guid;

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

  beforeEach((done) => {
    const app = express();
    const routes = router();
    routes.get('/v2/app_usage_events', (request, response) => {
      if (request.url.indexOf('after_guid') !== -1) {
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

    // Change slack window to be able to submit usage for last month
    process.env.SLACK = '32D';

    // Disable wait for correct app-event ordering
    process.env.GUID_MIN_AGE = twentySecondsInMilliseconds;

    // Trigger renewer every 2 seconds
    process.env.RETRY_INTERVAL = 2000;

    // Start all Abacus services
    const startServices = () => {
      start('abacus-eureka-plugin');
      start('abacus-provisioning-plugin');
      start('abacus-account-plugin');
      start('abacus-usage-collector');
      start('abacus-usage-meter');
      start('abacus-usage-accumulator');
      start('abacus-usage-aggregator');
      start('abacus-usage-reporting');
      start('abacus-cf-bridge');

      done();
    };

    // Start local database server
    if (!process.env.DB) {
      start('abacus-pouchserver');
      startServices();
    }
    else
    // Delete test dbs on the configured db server
      dbclient.drop(process.env.DB, /^abacus-/, () => {
        startServices();
      });
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
    stop('abacus-pouchserver', finishCb);

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

  const checkLastMonthWindow = (windowName, usage, level) => {
    const windowUsage = usage.windows[timeWindows.month];
    const previousMonth = windowUsage[1];

    expect(previousMonth).to.not.equal(undefined);

    if (level !== 'resource') {
      expect(previousMonth).to.contain.all.keys('quantity', 'charge');
      debug('%s month window; Expected: consuming=%d, charge>0; ' +
        'Actual: consuming=%d, charge=%d; Month window: %o', windowName,
        expectedConsuming, previousMonth.quantity.consuming,
        previousMonth.charge, previousMonth);
      expect(previousMonth.quantity.consuming).to.equal(expectedConsuming);
    }
    else
      debug('%s month window; Expected: charge>0; ' +
        'Actual: charge=%o; Month window: %o',
        windowName, previousMonth.charge, previousMonth);

    expect(previousMonth).to.contain.all.keys('charge');
    expect(previousMonth.charge).to.not.equal(undefined);
    expect(previousMonth.charge).to.be.above(0);
  };

  const checkCurrentMonthWindow = (windowName, usage, level) => {
    const windowUsage = usage.windows[timeWindows.month];
    const currentMonth = windowUsage[0];

    expect(currentMonth).to.not.equal(undefined);

    if (level !== 'resource') {
      expect(currentMonth).to.contain.all.keys('quantity', 'charge');
      debug('%s window; Expected: consuming=%d, charge>0; ' +
        'Actual: consuming=%d, charge=%d; Month window: %o',
        windowName, expectedConsuming, currentMonth.quantity.consuming,
        currentMonth.charge, currentMonth);
      expect(currentMonth.quantity.consuming).to.equal(expectedConsuming);
    }
    else
      debug('%s window; Expected:  charge>0; ' +
        'Actual: charge=%o; Month window: %o',
        windowName, currentMonth.charge, currentMonth);

    expect(currentMonth.charge).not.to.equal(undefined);
    expect(currentMonth).to.contain.all.keys('charge');
    expect(currentMonth.charge).to.be.above(0);
  };

  const checkReport = (cb, checkFn) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: testDataOrgGuid
      }, (error, response) => {
        try {
          expect(error).to.equal(undefined);

          expect(response.body).to.contain.all.keys('resources', 'spaces');
          const resources = response.body.resources;
          expect(resources.length).to.equal(1);
          expect(response.body.spaces.length).to.equal(1);

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

  const poll = (fn, checkFn, done, timeout = 1000, interval = 100) => {
    const startTimestamp = Date.now();

    const doneCallback = (err) => {
      if (!err) {
        debug('Expectation in %s met', fn.name);
        setImmediate(() => done());
        return;
      }

      if (Date.now() - startTimestamp > timeout) {
        debug('Expectation not met for %d ms. Error: %o', timeout, err);
        setImmediate(() => done(new Error(err)));
      }
      else
        setTimeout(() => {
          debug('Calling %s after >= %d ms...', fn.name, interval);
          fn(doneCallback, checkFn);
        }, interval);
    };

    debug('Calling %s for the first time...', fn.name);
    fn(doneCallback, checkFn);
  };

  const waitForStartAndPoll = (component, port, checkFn, timeout, done) => {
    let startWaitTime = Date.now();
    request.waitFor('http://localhost::p/v1/cf/:component',
      { component: component, p: port },
      startTimeout, (err, uri, opts) => {
        // Failed to ping component before timing out
        if (err) throw err;

        // Check report
        request.get(uri, {}, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);

          const t = timeout - (Date.now() - startWaitTime);
          debug('Time left for executing test: %d ms', t);
          poll(checkReport, checkFn, (error) => {
            done(error);
          }, t, 1000);
        });
      }
    );
  };

  context('with stream of CF events', () => {
    beforeEach(() => {
      // 37 apps consuming 512 MB
      // one app using 4 GB
      // total: 22.5 GB
      expectedConsuming = 22.5;
    });

    it('submits usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      const startTestTime = Date.now();
      waitForStartAndPoll('bridge', 9500, checkLastMonthWindow, totalTimeout,
        (error) => {
          if (error) {
            done(error);
            return;
          }
          start('abacus-cf-renewer');
          waitForStartAndPoll('renewer', 9501, checkCurrentMonthWindow,
            totalTimeout - (Date.now() - startTestTime), done);
        }
      );
    });
  });
});
