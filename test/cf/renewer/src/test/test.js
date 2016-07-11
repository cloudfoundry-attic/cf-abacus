'use strict';

const cp = require('child_process');
const util = require('util');
const _ = require('underscore');
const clone = _.clone;

const jwt = require('jsonwebtoken');
const commander = require('commander');

const dbclient = require('abacus-dbclient');
const express = require('abacus-express');
const request = require('abacus-request');
const router = require('abacus-router');
const moment = require('moment');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-renewer-itest');
const requestDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-response');
const responseDebug =
  require('abacus-debug')('abacus-cf-renewer-itest-result');

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

  beforeEach((done) => {
    // Enable/disable the oAuth token authorization
    process.env.SECURED = secured ? 'true' : 'false';
    debug('Set SECURED = %s', process.env.SECURED);

    // Secure environment variables
    process.env.API = 'http://localhost:4321';
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
        total_results: 1,
        total_pages: 1,
        prev_url: null,
        next_url: null,
        resources: [
          {
            metadata: {
              guid: '904419c3',
              url: '/v2/app_usage_events/904419c3',
              created_at:
                new Date(lastMonthInMilliseconds).toISOString()
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STOPPED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 0,
              instance_count: 1,
              previous_instance_count: 0,
              app_guid: '35c4ff2e',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'diego',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              previous_package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web'
            }
          }
        ]
      });
    });
    routes.get('/v2/info', (request, response) => {
      response.status(200).send({
        token_endpoint: 'http://localhost:4321'
      });
    });
    routes.get('/oauth/token', (request, response) => {
      if (request.headers.authorization ===
        'Basic YWJhY3VzLWxpbnV4LWNvbnRhaW5lcjpzZWNyZXQ=')
        response.status(200).send({
          token_type: 'bearer',
          access_token: signedResourceToken,
          expires_in: 100000,
          scope: 'abacus.usage.linux-container.read ' +
            'abacus.usage.linux-container.write',
          jti: '254abca5-1c25-40c5-99d7-2cc641791517'
        });
      else
        response.status(200).send({
          token_type: 'bearer',
          access_token: signedSystemToken,
          expires_in: 100000,
          scope: 'abacus.usage.read ' +
          'abacus.usage.write',
          jti: '254abca5-1c25-40c5-99d7-2cc641791517'
        });
    });
    app.use(routes);
    app.use(router.batch(routes));
    server = app.listen(4321);

    // Start all Abacus services
    const startServices = () => {
      start('abacus-eureka-plugin');
      start('abacus-authserver-plugin');
      start('abacus-provisioning-plugin');
      start('abacus-account-plugin');
      start('abacus-usage-collector');
      start('abacus-usage-meter');
      start('abacus-usage-accumulator');
      start('abacus-usage-aggregator');
      start('abacus-usage-reporting');
      start('abacus-cf-bridge');
      start('abacus-cf-renewer');

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
    stop('abacus-authserver-plugin', finishCb);
    stop('abacus-eureka-plugin', finishCb);
    stop('abacus-pouchserver', finishCb);

    server.close();

    delete process.env.API;
    delete process.env.CF_CLIENT_ID;
    delete process.env.CF_CLIENT_SECRET;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
    delete process.env.JWTKEY;
    delete process.env.JWTALGO;
    delete process.env.SLACK;
    delete process.env.RETRY_INTERVAL;
  });

  const checkAllTimeWindows = (usage) => {
    const windowUsage = usage.windows[timeWindows.month];
    let found;

    for (const windowEntry of windowUsage) {
      found = windowEntry &&
        windowEntry.quantity.consuming === 0.5 &&
        windowEntry.charge > 0;
      if (found)
        break;
    }
    expect(found).to.equal(true);
  };

  const checkReport = (cb) => {
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
          checkAllTimeWindows(planUsage);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage);

          responseDebug('All usage report checks are successful for: %s',
            JSON.stringify(response.body, null, 2));

          cb();
        }
        catch (e) {
          const message = util.format('Check failed with %s.\n' +
            'Usage report:\n', e.stack,
            response ? JSON.stringify(response.body, null, 2) : undefined);
          requestDebug(message);
          cb(new Error(message), e);
        }
      });
  };

  const poll = (fn, done, timeout = 1000, interval = 100) => {
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
          fn(doneCallback);
        }, interval);
    };

    debug('Calling %s for the first time...', fn.name);
    fn(doneCallback);
  };

  it('submits runtime usage to usage collector', function(done) {
    this.timeout(totalTimeout + 2000);

    // Wait for renewer to start
    const startWaitTime = Date.now();
    request.waitFor('http://localhost::p/v1/cf/renewer', { p: 9501 },
      startTimeout, (err, uri, opts) => {
        // Failed to ping renewer before timing out
        if (err) throw err;

        // Check report
        request.get(uri, {
          headers: {
            authorization: secured ? 'bearer ' + signedSystemToken : ''
          }
        }, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);

          poll(checkReport, done,
            totalTimeout - (Date.now() - startWaitTime), 1000);
        });
      }
    );
  });
};

describe('abacus-cf-renewer-itest without oAuth', () => test(false));

describe('abacus-cf-renewer-itest with oAuth', () => test(true));
