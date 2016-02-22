'use strict';

const commander = require('commander');
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

// Checks if the difference between start and end time fall within a window
const isWithinWindow = (start, end, timeWindow) => {
  // [Second, Minute, Hour, Day, Month]
  const timescale = [1, 100, 10000, 1000000, 100000000];
  // Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
  const dateUTCNumbify = (t) => {
    const d = new Date(t);
    return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
      + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
      + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
  };

  return Math.floor(dateUTCNumbify(end) / timescale[timeWindow]) -
    Math.floor(dateUTCNumbify(start) / timescale[timeWindow]) === 0;
};

process.env.API = 'http://localhost:4321';

process.env.CF_CLIENT_ID = 'abacus-cf-bridge';
process.env.CF_CLIENT_SECRET = 'secret';

process.env.CLIENT_ID = 'abacus-linux-container';
process.env.CLIENT_SECRET = 'secret';
process.env.JWTKEY = 'encode';
process.env.JWTALGO = 'HS256';

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
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

describe('abacus-cf-bridge-itest', () => {
  let server;
  let submittime = new Date();

  before(() => {
    const start = (module) => {
      debug('Starting %s in directory %s', module, moduleDir(module));
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

    const encodedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJmYTFiMjlmZS03NmE5LT' +
      'RjMmQtOTAzZS1kZGRkMDU2M2E5ZTMiLCJzdWIiOiJydW50aW1lZXh0IiwiYXV0aG9yaXRp' +
      'ZXMiOlsic2NpbS5yZWFkIiwidWFhLnJlc291cmNlIiwib3BlbmlkIiwiY2xvdWRfY29udH' +
      'JvbGxlci5yZWFkIiwic2VydmljZV9icm9rZXIiXSwic2NvcGUiOlsic2NpbS5yZWFkIiwi' +
      'dWFhLnJlc291cmNlIiwib3BlbmlkIiwiYWJhY3VzLnVzYWdlLmxpbnV4LWNvbnRhaW5lci' +
      '53cml0ZSIsImFiYWN1cy51c2FnZS5saW51eC1jb250YWluZXIucmVhZCJdLCJjbGllbnRf' +
      'aWQiOiJydW50aW1lZXh0IiwiY2lkIjoicnVudGltZWV4dCIsImF6cCI6InJ1bnRpbWVleH' +
      'QiLCJncmFudF90eXBlIjoiY2xpZW50X2NyZWRlbnRpYWxzIiwiaWF0IjoxNDQwNDY0MzI5' +
      'LCJleHAiOjE0NDA1MDc1MjksImlzcyI6Imh0dHBzOi8vdWFhLmNmLm5ldC9vYXV0aC90b2' +
      'tlbiIsInppZCI6InVhYSIsImF1ZCI6WyJydW50aW1lZXh0Iiwic2NpbSIsImNsb3VkX2Nv' +
      'bnRyb2xsZXIiLCJ1YWEiLCJvcGVuaWQiXX0.h7XowzPRFP6kbUefs73YQT8AIRotWEdEaw' +
      'R3CGjQqys';

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
              created_at: submittime.toISOString()
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
    routes.get('/v2/info',
      (request, response) => {
        response.status(200).send({
          token_endpoint: 'http://localhost:4321'
        });
      });
    routes.get('/oauth/token',
      (request, response) => {
        response.status(200).send({
          token_type: 'bearer',
          access_token: encodedToken,
          expires_in: 100000
        });
      });
    app.use(routes);
    app.use(router.batch(routes));
    server = app.listen(4321);

    if (!process.env.DB)
      start('abacus-pouchserver');
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
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    stop('abacus-cf-bridge');
    stop('abacus-usage-reporting');
    stop('abacus-usage-aggregator');
    stop('abacus-usage-accumulator');
    stop('abacus-usage-meter');
    stop('abacus-usage-collector');
    stop('abacus-account-plugin');
    stop('abacus-provisioning-plugin');
    stop('abacus-authserver-plugin');
    stop('abacus-eureka-plugin');
    if (!process.env.DB)
      stop('abacus-pouchserver');

    server.close();
  });

  const checkAllTimeWindows = (usage, reporttime) => {
    for (const windowType in timeWindows) {
      if(isWithinWindow(submittime, reporttime, timeWindows[windowType])) {
        const windowUsage = usage.windows[timeWindows[windowType]];
        expect(windowUsage[0].quantity.consuming).to.equal(0.5);
        expect(windowUsage[0].charge).to.be.above(0);
      }
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
          const reporttime = new Date();

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkAllTimeWindows(planUsage, reporttime);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage, reporttime);

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
    this.timeout(totalTimeout + 2000);

    // Wait for bridge to start
    request.waitFor('http://localhost::p/v1/cf/bridge',
      { p: 9500 }, startTimeout, (err, uri, opts) => {
        // Failed to ping bridge before timing out
        if (err) throw err;

        // Check report
        request.get(uri, opts, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);

          poll(checkReport, done, totalTimeout, 2000);
        });
      }
    );
  });
});

