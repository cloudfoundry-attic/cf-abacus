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
  require('abacus-debug')('abacus-cf-multiple-services-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-multiple-services-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-multiple-services-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-multiple-services-itest-oauth');

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
      'abacus.usage.services.write',
      'abacus.usage.services.read'
    ],
    scope: [
      'abacus.usage.services.read',
      'abacus.usage.services.write'
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
      'abacus.usage.services'
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

const organizationId = 'e8139b76-e829-4af3-b332-87316b1c0a6c';

describe('abacus-cf multiple-services-test with oAuth', () => {
  let server;
  let serverPort;
  let serviceUsageEvents;

  let noUsageExpected;
  let expectedConsuming;

  beforeEach((done) => {
    const app = express();
    const routes = router();
    routes.get('/v2/service_usage_events', (request, response) => {
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
        total_results: serviceUsageEvents.length,
        total_pages: 1,
        prev_url: null,
        next_url: null,
        resources: serviceUsageEvents
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
    process.env.CLIENT_ID = 'abacus-services';
    process.env.CLIENT_SECRET = 'secret';
    process.env.ABACUS_CLIENT_ID = 'abacus-cf-renewer';
    process.env.ABACUS_CLIENT_SECRET = 'secret';
    process.env.JWTKEY = tokenSecret;
    process.env.JWTALGO = tokenAlgorithm;
    process.env.SERVICES = '[map[PLANS:map[4fd1a379-2738-408e-9020-' +
      'c5238a47a004:medium] NAME:mongodb GUID:bc3690b2-' +
      'cc50-4475-b2cf-44d68c51f9d3]]';

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
      npm.modules.services
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
        organization_id: organizationId,
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
    token: () => `bearer ${signedSystemToken}`,
    checkFn: checkFn,
    startTimeout: startTimeout,
    totalTimeout: timeout
  });

  context('with multiple services', () => {

    context('create, (ignored) update & delete', () => {
      beforeEach(() => {
        const meta = (shift) => ({
          guid: `b457f9e6-19f6-4263-9ffe-be39feccd576${shift}`,
          url: '/v2/service_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
          created_at: moment.utc(lastMonthInMilliseconds + shift).toISOString()
        });

        serviceUsageEvents = [
          {
            metadata: meta(0),
            entity: {
              state: 'CREATED',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: organizationId,
              service_instance_guid: '1',
              service_instance_name: 'MongoDB',
              service_instance_type: 'managed_service_instance',
              service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
              service_plan_name: 'v3.0-dedicated-medium',
              service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
              service_label: 'mongodb'
            }
          },
          {
            metadata: meta(1),
            entity: {
              state: 'UPDATED',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: organizationId,
              service_instance_guid: '1',
              service_instance_name: 'MongoDB',
              service_instance_type: 'managed_service_instance',
              service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
              service_plan_name: 'v3.0-dedicated-medium',
              service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
              service_label: 'mongodb'
            }
          },
          {
            metadata: meta(2),
            entity: {
              state: 'CREATED',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: organizationId,
              service_instance_guid: '2',
              service_instance_name: 'MongoDB',
              service_instance_type: 'managed_service_instance',
              service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
              service_plan_name: 'v3.0-dedicated-medium',
              service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
              service_label: 'mongodb'
            }
          },
          {
            metadata: meta(3),
            entity: {
              state: 'DELETED',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: organizationId,
              service_instance_guid: '1',
              service_instance_name: 'MongoDB',
              service_instance_type: 'managed_service_instance',
              service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
              service_plan_name: 'v3.0-dedicated-medium',
              service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
              service_label: 'mongodb'
            }
          },
          {
            metadata: meta(4),
            entity: {
              state: 'CREATED',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: organizationId,
              service_instance_guid: '3',
              service_instance_name: 'MongoDB',
              service_instance_type: 'managed_service_instance',
              service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
              service_plan_name: 'v3.0-dedicated-medium',
              service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
              service_label: 'mongodb'
            }
          },
          {
            metadata: meta(5),
            entity: {
              state: 'DELETED',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'abacus',
              org_guid: organizationId,
              service_instance_guid: '2',
              service_instance_name: 'MongoDB',
              service_instance_type: 'managed_service_instance',
              service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
              service_plan_name: 'v3.0-dedicated-medium',
              service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
              service_label: 'mongodb'
            }
          }
        ];

        expectedConsuming = 1;
      });

      it('submits runtime usage to usage collector', function(done) {
        this.timeout(totalTimeout + 2000);

        const startTestTime = moment.now();
        const bridgeOptions = pollOptions(
          'services', 9502,
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
  });
});
