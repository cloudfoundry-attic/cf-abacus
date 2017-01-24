'use strict';

const cp = require('child_process');
const commander = require('commander');
const jwt = require('jsonwebtoken');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;

const dbclient = require('abacus-dbclient');
const express = require('abacus-express');
const request = require('abacus-request');
const router = require('abacus-router');
const moment = require('abacus-moment');

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
    sub: 'abacus-cf-renewer',
    authorities: [
      'abacus.usage.linux-container.write',
      'abacus.usage.linux-container.read'
    ],
    scope: [
      'abacus.usage.linux-container.read',
      'abacus.usage.linux-container.write'
    ],
    client_id: 'abacus-cf-renewer',
    cid: 'abacus-cf-renewer',
    azp: 'abacus-cf-renewer',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-renewer',
      'abacus.usage.linux-container'
    ]
  },
  signature: '7BVRprw-yySpW7lSkM8KPZoUIw2w61bs87l0YXqUT8E'
};
const systemToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: '254abca5-1c25-40c5-99d7-2cc641791517',
    sub: 'abacus-cf-renewer',
    authorities: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    scope: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    client_id: 'abacus-cf-renewer',
    cid: 'abacus-cf-renewer',
    azp: 'abacus-cf-renewer',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-renewer',
      'abacus.usage'
    ]
  },
  signature: '1J3_hBJBUgwRO9fzg25sdDYj6DqCVWCNB3veyIBsklM'
};
const signedResourceToken = jwt.sign(resourceToken.payload, tokenSecret, {
  expiresIn: 43200
});
const signedSystemToken = jwt.sign(systemToken.payload, tokenSecret, {
  expiresIn: 43200
});

const lastMonthInMilliseconds = moment().utc().subtract(1, 'months').valueOf();

const test = (secured) => {
  let server;
  let serverPort;
  let appUsageEvents;

  let noUsageExpected;
  let expectedConsuming;

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

      response.status(200).send({
        total_results: appUsageEvents.length,
        total_pages: 1,
        prev_url: null,
        next_url: null,
        resources: appUsageEvents
      });
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

    // Enable/disable the oAuth token authorization
    process.env.SECURED = secured ? 'true' : 'false';
    debug('Set SECURED = %s', process.env.SECURED);

    // Secure environment variables
    process.env.API = 'http://localhost:' + serverPort;
    process.env.AUTH_SERVER = 'http://localhost:' + serverPort;
    process.env.CF_CLIENT_ID = 'abacus-cf-renewer';
    process.env.CF_CLIENT_SECRET = 'secret';
    process.env.CLIENT_ID = 'abacus-linux-container';
    process.env.CLIENT_SECRET = 'secret';
    process.env.ABACUS_CLIENT_ID = 'abacus-cf-renewer';
    process.env.ABACUS_CLIENT_SECRET = 'secret';
    process.env.JWTKEY = tokenSecret;
    process.env.JWTALGO = tokenAlgorithm;

    // Change slack window to be able to submit usage for last month
    process.env.SLACK = '32D';

    // Trigger renewer every 2 seconds
    process.env.RETRY_INTERVAL = 2000;

    noUsageExpected = false;

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
    let counter = 11;
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

    delete process.env.SECURED;
    delete process.env.API;
    delete process.env.AUTH_SERVER;
    delete process.env.CF_CLIENT_ID;
    delete process.env.CF_CLIENT_SECRET;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
    delete process.env.JWTKEY;
    delete process.env.JWTALGO;
    delete process.env.SLACK;
    delete process.env.RETRY_INTERVAL;
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

    if (noUsageExpected) {
      debug('%s window; Expected: no usage; Actual: %j',
        windowName, currentMonth);
      expect(currentMonth).to.equal(null);
      return;
    }

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
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
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
          fn(doneCallback, checkFn);
        }, interval);
    };

    debug('Calling %s for the first time...', fn.name);
    fn(doneCallback, checkFn);
  };

  const waitForStartAndPoll = (component, port, checkFn, timeout, done) => {
    let startWaitTime = moment.now();
    request.waitFor('http://localhost::p/v1/cf/:component',
      { component: component, p: port },
      startTimeout, (err, uri, opts) => {
        // Failed to ping component before timing out
        if (err) throw err;

        // Check report
        request.get(uri, {
          headers: {
            authorization: secured ? 'bearer ' + signedSystemToken : ''
          }
        }, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);

          const t = timeout - (moment.now() - startWaitTime);
          debug('Time left for executing test: %d ms', t);
          poll(checkReport, checkFn, (error) => {
            done(error);
          }, t, 1000);
        });
      }
    );
  };

  context('with multiple apps', () => {

    context('start, stop, start, scale out', () => {
      beforeEach(() => {
        appUsageEvents = [
          // app1 start
          {
            metadata: {
              guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: new moment(lastMonthInMilliseconds).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STOPPED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              previous_package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 buildpack set
          {
            metadata: {
              guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment(lastMonthInMilliseconds + 1).toISOString()
            },
            entity: {
              state: 'BUILDPACK_SET',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app2 start
          {
            metadata: {
              guid: 'b557f9e6-19f6-4263-9ffe-be39feccd577',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment(lastMonthInMilliseconds + 2).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STOPPED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '45c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              previous_package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 stop
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment(lastMonthInMilliseconds + 3).toISOString()
            },
            entity: {
              state: 'STOPPED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app2 buildpack set
          {
            metadata: {
              guid: '1f2336af-1866-4d2b-8845-0efb14c1a389',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment(lastMonthInMilliseconds + 4).toISOString()
            },
            entity: {
              state: 'BUILDPACK_SET',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '45c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 start #2
          {
            metadata: {
              guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment(lastMonthInMilliseconds + 5).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STOPPED',
              memory_in_mb_per_instance: 256,
              previous_memory_in_mb_per_instance: 256,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              previous_package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app2 scale
          {
            metadata: {
              guid: '358ea444-943d-4a6e-9928-786a5bb93dfb',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment(lastMonthInMilliseconds + 6).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 2,
              previous_instance_count: 1,
              app_guid: '45c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 buildpack set #2
          {
            metadata: {
              guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment(lastMonthInMilliseconds + 7).toISOString()
            },
            entity: {
              state: 'BUILDPACK_SET',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 256,
              previous_memory_in_mb_per_instance: 256,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 scale
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment(lastMonthInMilliseconds + 8).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 256,
              instance_count: 2,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          }
        ];

        // app1 first start: 0.5 GB
        // app1 second start: 0.25 GB
        // app1 scale out: 2 x 1 GB = 2GB
        // app2 first start: 0.5 GB
        // app2 second start: 0.25 GB
        // app1 scale out: 2 x 1 GB = 2GB
        //
        // buildpack_set events are ignored
        expectedConsuming = 4;
      });

      it('submits runtime usage to usage collector', function(done) {
        this.timeout(totalTimeout + 2000);

        const startTestTime = moment.now();
        waitForStartAndPoll('bridge', 9500, checkLastMonthWindow, totalTimeout,
          (error) => {
            if (error) {
              done(error);
              return;
            }
            start('abacus-cf-renewer');
            waitForStartAndPoll('renewer', 9501, checkCurrentMonthWindow,
              totalTimeout - (moment.now() - startTestTime), done);
          }
        );
      });
    });

    context('start, scale out, stop', () => {
      beforeEach(() => {
        appUsageEvents = [
          // app1 start
          {
            metadata: {
              guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment(lastMonthInMilliseconds).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STOPPED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 1024,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              previous_package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 buildpack set
          {
            metadata: {
              guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment(lastMonthInMilliseconds + 1).toISOString()
            },
            entity: {
              state: 'BUILDPACK_SET',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 1024,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app2 start
          {
            metadata: {
              guid: 'b557f9e6-19f6-4263-9ffe-be39feccd577',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment(lastMonthInMilliseconds + 2).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STOPPED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 1024,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '45c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              previous_package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app2 buildpack set
          {
            metadata: {
              guid: '1f2336af-1866-4d2b-8845-0efb14c1a389',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment(lastMonthInMilliseconds -
                + 3).toISOString()
            },
            entity: {
              state: 'BUILDPACK_SET',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 1024,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '45c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 scale out
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment(lastMonthInMilliseconds + 4).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 2048,
              previous_memory_in_mb_per_instance: 1024,
              instance_count: 2,
              previous_instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app2 stop
          {
            metadata: {
              guid: '458ea444-943d-4a6e-9928-786a5bb93dfb',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment(lastMonthInMilliseconds + 5).toISOString()
            },
            entity: {
              state: 'STOPPED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 1024,
              previous_memory_in_mb_per_instance: 1024,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '45c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          },
          // app1 stop
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment(lastMonthInMilliseconds + 6).toISOString()
            },
            entity: {
              state: 'STOPPED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 2048,
              previous_memory_in_mb_per_instance: 2048,
              instance_count: 2,
              previous_instance_count: 2,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
              buildpack_name: 'staticfile_buildpack',
              package_state: 'STAGED',
              previous_package_state: 'STAGED',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web',
              task_name: null,
              task_guid: null
            }
          }
        ];

        // app1 start: 1 GB
        // app1 scale: 2x2GB = 4GB
        // app1 stop: 0GB
        // app2 start: 1 GB
        // app2 stop: 0GB
        //
        // buildpack_set events are ignored
        expectedConsuming = 0;
        noUsageExpected = true;
      });

      it('submits runtime usage to usage collector', function(done) {
        this.timeout(totalTimeout);

        const startTestTime = moment.now();
        waitForStartAndPoll('bridge', 9500, checkLastMonthWindow, totalTimeout,
          (error) => {
            if (error) {
              done(error);
              return;
            }
            start('abacus-cf-renewer');
            waitForStartAndPoll('renewer', 9501, checkCurrentMonthWindow,
              totalTimeout - (moment.now() - startTestTime), done);
          }
        );
      });
    });
  });
};

describe('abacus-cf-renewer multiple-apps-test without oAuth',
  () => test(false));

describe('abacus-cf-renewer multiple-apps-test with oAuth',
  () => test(true));
