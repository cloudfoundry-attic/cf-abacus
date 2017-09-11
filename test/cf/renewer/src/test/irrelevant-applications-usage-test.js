'use strict';

const commander = require('commander');
const jwt = require('jsonwebtoken');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;

const client = require('abacus-client');
const dbclient = require('abacus-dbclient');
const express = require('abacus-express');
const request = require('abacus-request');
const router = require('abacus-router');
const moment = require('abacus-moment');
const npm = require('abacus-npm');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-renewer-applications-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-renewer-applications-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-renewer-applications-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-renewer-applications-itest-oauth');

const orgGuid = 'e8139b76-e829-4af3-b332-87316b1c0a6c';

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

const test = (secured) => {
  let server;
  let serverPort;

  let appUsageEvents;

  let expectedConsuming;
  let noReportExpected;

  const pollOptions = (component, port, checkFn, timeout = totalTimeout) => ({
    component: component,
    p: port,
    token: () => secured ? 'bearer ' + signedSystemToken : '',
    checkFn: checkFn,
    startTimeout: startTimeout,
    totalTimeout: timeout
  });

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

      responseDebug('Returning events %j', appUsageEvents);
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

    // Enable/disable the oAuth token authorization
    process.env.SECURED = secured ? 'true' : 'false';
    debug('Set SECURED = %s', process.env.SECURED);

    // Set environment variables
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

    // Change slack window to be able to submit usage for last 2 months
    process.env.SLACK = '63D';

    // Trigger renewer every 2 seconds
    process.env.RETRY_INTERVAL = 2000;

    noReportExpected = false;

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

    expect(currentMonth).to.contain.all.keys('charge');
    expect(currentMonth.charge).not.to.equal(undefined);
    expect(currentMonth.charge).to.be.above(0);
  };

  const checkReport = (checkFn, cb) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: orgGuid,
        headers: {
          authorization: 'bearer ' + signedSystemToken
        }
      }, (error, response) => {
        try {
          expect(error).to.equal(undefined);

          expect(response.body).to.contain.all.keys('resources', 'spaces');
          const resources = response.body.resources;

          if (noReportExpected) {
            expect(resources.length).to.equal(0);
            cb();
            return;
          }

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

  context('start app in current month', () => {
    beforeEach(() => {
      const today = moment.utc().valueOf();
      appUsageEvents = [
        {
          metadata: {
            guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
            url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
            created_at: moment.utc(today).toISOString()
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
            org_guid: orgGuid,
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
        }
      ];

      // start: 0.5 GB
      expectedConsuming = 0.5;
    });

    it('usage is not duplicated', function(done) {
      this.timeout(totalTimeout + 2000);

      const startTestTime = moment.now();
      const bridgeOptions = pollOptions(
        'applications', 9500,
        checkCurrentMonthWindow
      );
      client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
        checkReport, bridgeOptions, (error) => {
          if (error) {
            done(error);
            return;
          }

          npm.startModules([npm.modules.renewer]);
          // Allow the renewer to kick-in
          setTimeout(() => {
            const renewerOptions = pollOptions(
              'renewer', 9501,
              checkCurrentMonthWindow,
              totalTimeout - (moment.now() - startTestTime)
            );

            client.waitForStartAndPoll(
              'http://localhost::p/v1/cf/:component',
              checkReport, renewerOptions, done);
          }, 2000);
        }
      );
    });
  });

  context('with app started 3 months ago outside slack window', () => {
    beforeEach(() => {
      const threeMonthsAgo = moment.utc().subtract(3, 'months').valueOf();
      appUsageEvents = [
        {
          metadata: {
            guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
            url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
            created_at: moment.utc(threeMonthsAgo).toISOString()
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
            org_guid: orgGuid,
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
        }
      ];

      // expect no usage to be aggregated/accumulated
      noReportExpected = true;
    });

    it('does not submit usage', function(done) {
      this.timeout(totalTimeout + 2000);

      const startTestTime = moment.now();
      const bridgeOptions = pollOptions(
        'applications', 9500,
        () => {}
      );
      client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
        checkReport, bridgeOptions, (error) => {
          if (error) {
            done(error);
            return;
          }
          npm.startModules([npm.modules.renewer]);
          const renewerOptions = pollOptions(
            'renewer', 9501,
            () => {},
            totalTimeout - (moment.now() - startTestTime)
          );
          client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
            checkReport, renewerOptions, done);
        }
      );
    });
  });

};

describe.skip('abacus-cf-renewer irrelevant-apps-usage-test with oAuth',
  () => test(true));
