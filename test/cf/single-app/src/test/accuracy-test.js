'use strict';

const commander = require('commander');
const jwt = require('jsonwebtoken');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;
const invert = _.invert;

const client = require('abacus-client');
const dbclient = require('abacus-dbclient');
const express = require('abacus-express');
const request = require('abacus-request');
const router = require('abacus-router');

const npm = require('abacus-npm');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-single-app-accuracy-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-single-app-accuracy-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-single-app-accuracy-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-single-app-accuracy-itest-oauth');


const moment = require('abacus-moment');
const twoDaysInNextMonth = moment.utc().startOf('month').
  add(1, 'month').add(2, 'days').add(6, 'hours').valueOf();

const timeWindows = {
  second : 0,
  minute : 1,
  hour   : 2,
  day    : 3,
  month  : 4
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

const twentySecondsInMilliseconds = 20 * 1000;

describe('abacus-cf-single-app-accuracy-itest', () => {
  let server;
  let serverPort;
  let appUsageEvents;
  let expectedGBh;

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

    process.env.ABACUS_TIME_OFFSET =
      moment.utc(twoDaysInNextMonth).diff(moment.now());

    // Disable wait for correct app-event ordering
    process.env.GUID_MIN_AGE = twentySecondsInMilliseconds;

    const modules = [
      npm.modules.eurekaPlugin,
      npm.modules.provisioningPlugin,
      npm.modules.accountPlugin,
      npm.modules.collector,
      npm.modules.meter,
      npm.modules.accumulator,
      npm.modules.aggregator,
      npm.modules.reporting,
      npm.modules.applications
    ];

    if (!process.env.DB) {
      modules.push(npm.modules.pouchserver);
      npm.startModules(modules, done);
    }
    else
      dbclient.drop(process.env.DB, /^abacus-/, () => {
        npm.startModules(modules, done);
      });
  });

  afterEach((done) => {
    server.close();
    npm.stopAllStarted(done);
  });

  const checkTimeWindows = (usage, timeWindow) => {
    const window = usage.windows[timeWindow];

    debug('Checking %j window %j ',
      invert(timeWindows)[timeWindow], usage.windows[timeWindow]);

    expect(window[0].charge).to.be.above(0);
    expect(window[0].summary).to.be.closeTo(expectedGBh, 0.1);
  };

  const checkReport = (cb) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
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
          expect(response.body.spaces.length).to.equal(1);

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkTimeWindows(planUsage, timeWindows.day);
          checkTimeWindows(planUsage, timeWindows.month);

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

  const pollOptions = (component, port) => ({
    component: component,
    p: port,
    startTimeout: startTimeout,
    totalTimeout: totalTimeout
  });

  const generatePastAppUsage = (value, timeUnit) => [
    {
      metadata: {
        guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
        url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
        created_at: moment.utc(twoDaysInNextMonth).
          subtract(value, timeUnit).toISOString()
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

  context('with an app started 1 hour ago', () => {

    beforeEach(() => {
      appUsageEvents = generatePastAppUsage(1, 'hour');

      // 512MB * 1h = 0.5 GBh
      expectedGBh = 0.5;
    });

    it('submits usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
        checkReport, pollOptions('applications', 9500), done);
    });

  });

  context('with an app started 2 hours ago', () => {

    beforeEach(() => {
      appUsageEvents = generatePastAppUsage(2, 'hours');

      // 512MB * 2h = 1 GBh
      expectedGBh = 1;
    });

    it('submits usage and gets expected report back', function(done) {
      this.timeout(totalTimeout + 2000);

      client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
        checkReport, pollOptions('applications', 9500), done);
    });

  });

});
