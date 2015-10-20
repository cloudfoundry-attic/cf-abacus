'use strict';

const cp = require('child_process');
const _ = require('underscore');
const util = require('util');

const request = require('abacus-request');
const router = require('abacus-router');
const express = require('abacus-express');

const clone = _.clone;

// Setup the debug log
const debug = require('abacus-debug')('abacus-cf-bridge-itest');

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

process.env.API = 'http://localhost:4321';
process.env.UAA = 'http://localhost:4321';

describe('abacus-cf-bridge-itest', () => {
  let server;

  before(() => {
    const start = (module) => {
      const c = cp.spawn('npm', ['run', 'start'], {
        cwd: moduleDir(module),
        env: clone(process.env)
      });

      // Add listeners to stdout, stderr and exit messsage and forward the
      // messages to debug logs
      c.stdout.on('data', (d) => process.stdout.write(d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('exit', (c) => debug('Application exited with code %d', c));
    };

    const app = express();
    const routes = router();
    routes.get('/v2/app_usage_events', (request, response) => {
      response.status(200).send({
        total_results: 1,
        total_pages: 1,
        prev_url: null,
        next_url: null,
        resources: [
          {
            metadata: {
              guid: '904419c4',
              url: '/v2/app_usage_events/904419c4',
              created_at: new Date().toISOString()
            },
            entity: {
              state: 'STARTED',
              memory_in_mb_per_instance: 512,
              instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'diego',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web'
            }
          }
        ]
      });
    });
    routes.get('/v2/apps', (request, response) => {
      response.status(200).send({});
    });
    routes.get('/oauth/token',
      (request, response) => {
        response.status(200).send({
          token_type: 'bearer',
          access_token: 'token',
          expires_in: 100000
        });
      });
    app.use(routes);
    app.use(router.batch(routes));
    server = app.listen(4321);

    start('abacus-dbserver');
    start('abacus-provisioning-stub');
    start('abacus-account-stub');
    start('abacus-usage-collector');
    start('abacus-usage-meter');
    start('abacus-usage-accumulator');
    start('abacus-usage-aggregator');
    start('abacus-usage-rate');
    start('abacus-usage-reporting');
    start('abacus-cf-bridge');
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    stop('abacus-cf-bridge');
    stop('abacus-usage-reporting');
    stop('abacus-usage-rate');
    stop('abacus-usage-aggregator');
    stop('abacus-usage-accumulator');
    stop('abacus-usage-meter');
    stop('abacus-usage-collector');
    stop('abacus-account-stub');
    stop('abacus-provisioning-stub');
    stop('abacus-dbserver');

    server.close();
  });

  const checkAllTimeWindows = (usage) => {
    for (const windowType in timeWindows) {
      const windowUsage = usage.windows[timeWindows[windowType]];
      expect(windowUsage[0].quantity.consuming).to.equal(0.5);
      expect(windowUsage[0].summary).to.be.above(0);
      expect(windowUsage[0].charge).to.be.above(0);
    }
  };

  const checkReport = (cb) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c'
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

          cb();
        }
        catch (e) {
          const errorMsg = util.format('Check failed with %s.\nUsage report:\n',
            e.stack,
            response ? JSON.stringify(response.body, null, 2) : 'unknown');
          cb(new Error(errorMsg, e));
        }
      });
  };

  const poll = (fn, done, timeout = 1000, interval = 100) => {
    let lastError;

    const doneInterceptor = (err) => {
      if (!err) {
        debug('Expectation in %s met', fn.name);
        clearInterval(intervalTimer);
        clearTimeout(timeoutTimer);
        setImmediate(done);
      }
      lastError = err;
    };

    const intervalTimer = setInterval(() => {
      debug('Calling %s ...', fn.name);
      fn(doneInterceptor);
    }, interval);

    const timeoutTimer = setTimeout(() => {
      debug('Clearing expectation timer ...');
      clearInterval(intervalTimer);

      const msg = util.format('Expectation not met for %d ms. Last error: %s',
        timeout, lastError ? lastError.stack : 'unknown');
      debug(msg);
      setImmediate(() => done(lastError));
    }, timeout);
  };

  it('submit runtime usage to usage collector', function(done) {
    this.timeout(60000);

    // Wait for bridge to start
    request.waitFor(
      'http://localhost::p/v1/cf/bridge', { p: 9400 },
      (err, uri, opts) => {
        // Failed to ping bridge before timing out
        if (err) throw err;

        // Check report
        request.get(uri, opts, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);
          expect(response.body).to.equal('Hello');

          poll(checkReport, done, 50000, 2000);
        });
      }
    );
  });
});
