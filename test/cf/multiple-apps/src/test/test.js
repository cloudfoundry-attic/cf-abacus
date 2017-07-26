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
  require('abacus-debug')('abacus-cf-multiple-apps-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-multiple-apps-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-multiple-apps-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-multiple-apps-itest-oauth');

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

const lastMonthInMilliseconds = moment.utc().subtract(1, 'months').valueOf();

describe('abacus-cf multiple-apps-test with oAuth', () => {
  let server;
  let serverPort;
  let appUsageEvents;

  let noUsageExpected;
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

    // Enable the oAuth token authorization
    process.env.SECURED = 'true';

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

    expect(monthWindow).to.contain.all.keys('charge');
    expect(monthWindow.charge).not.to.equal(undefined);
    expect(monthWindow.charge).to.be.above(0);
  };

  const checkThisMonth = (windowName, usage, level) => {
    if (noUsageExpected) {
      const monthWindow = usage.windows[timeWindows.month][0];
      expect(monthWindow).to.not.equal(undefined);
      debug('%s window; Expected: no usage; Actual: %j',
        windowName, monthWindow);
      expect(monthWindow).to.equal(null);
    }
    else
      checkMonthWindow(windowName, 0, usage, level);
  };

  const checkLastMonth = (windowName, usage, level) => {
    checkMonthWindow(windowName, 1, usage, level);
  };

  const checkReport = (checkFn, cb) => {
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
    token: () => 'bearer ' + signedSystemToken,
    checkFn: checkFn,
    startTimeout: startTimeout,
    totalTimeout: timeout
  });

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
              created_at: moment.utc(lastMonthInMilliseconds + 1).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 2).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 3).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 4).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 5).toISOString()
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
          // app2 stop
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(lastMonthInMilliseconds + 6).toISOString()
            },
            entity: {
              state: 'STOPPED',
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
          // app2 scale
          {
            metadata: {
              guid: '358ea444-943d-4a6e-9928-786a5bb93dfb',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(lastMonthInMilliseconds + 7).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 8).toISOString()
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
          // app1 stop
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(lastMonthInMilliseconds + 9).toISOString()
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
          // app1 scale
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(lastMonthInMilliseconds + 10).toISOString()
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
        // app2 scale out: 2 x 1 GB = 2GB
        //
        // buildpack_set events are ignored
        expectedConsuming = 4;
      });

      it('submits runtime usage to usage collector', function(done) {
        this.timeout(totalTimeout + 2000);

        const startTestTime = moment.now();
        const bridgeOptions = pollOptions(
          'applications', 9500,
          checkLastMonth
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
              checkThisMonth,
              totalTimeout - (moment.now() - startTestTime));
            client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
              checkReport, renewerOptions, done);
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
              created_at: moment.utc(lastMonthInMilliseconds).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 1).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 2).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds -
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
              created_at: moment.utc(lastMonthInMilliseconds + 4).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 5).toISOString()
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
              created_at: moment.utc(lastMonthInMilliseconds + 6).toISOString()
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
              checkThisMonth,
              totalTimeout - (moment.now() - startTestTime));
            client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
              checkReport, renewerOptions, done);
          }
        );
      });
    });
  });
});
