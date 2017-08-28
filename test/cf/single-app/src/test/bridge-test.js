'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const commander = require('commander');
const jwt = require('jsonwebtoken');

const _ = require('underscore');
const clone = _.clone;

const client = require('abacus-client');
const dbclient = require('abacus-dbclient');
const express = require('abacus-express');
const moment = require('abacus-moment');
const request = require('abacus-request');
const router = require('abacus-router');

const npm = require('abacus-npm');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-single-app-bridge-itest');
const responseDebug =
  require('abacus-debug')('abacus-cf-single-app-bridge-itest-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-single-app-bridge-itest-result');
const oAuthDebug =
  require('abacus-debug')('abacus-cf-single-app-bridge-itest-oauth');

const timeWindows = {
  'hour'   : 2,
  'day'    : 3,
  'month'  : 4
};

// Checks if the difference between start and end time fall within a window
const isWithinWindow = (start, end, timeWindow) => {
  // [Second, Minute, Hour, Day, Month, Year]
  const timescale = [1, 100, 10000, 1000000, 100000000, 10000000000];
  // Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
  const dateUTCNumbify = (t) => {
    const d = moment.utc(t).toDate();
    return d.getUTCFullYear() * timescale[5] + d.getUTCMonth() * timescale[4]
      + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
      + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
  };

  return Math.floor(dateUTCNumbify(end) / timescale[timeWindow]) -
    Math.floor(dateUTCNumbify(start) / timescale[timeWindow]) === 0;
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

describe('abacus-cf-single-app-bridge-itest without oAuth', () => {
  const submittime = moment.now();

  let server;
  let serverPort;
  let appUsageEvents;
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

  const checkAllTimeWindows = (usage, reporttime, level) => {
    for (const windowType in timeWindows)
      if(isWithinWindow(submittime, reporttime, timeWindows[windowType])) {
        const windowUsage = usage.windows[timeWindows[windowType]];
        if(level !== 'resource')
          expect(windowUsage[0].quantity.consuming).to.equal(expectedConsuming);
        expect(windowUsage[0].charge).to.be.above(0);
      }
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
          const reporttime = moment.now();

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkAllTimeWindows(planUsage, reporttime);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage, reporttime, 'resource');

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

  context('with a single app', () => {

    context('start, stop, start, scale out', () => {
      beforeEach(() => {
        appUsageEvents = [
          {
            metadata: {
              guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds).toISOString()
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
          {
            metadata: {
              guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 1).toISOString()
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
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 2).toISOString()
            },
            entity: {
              state: 'STOPPED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
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
          {
            metadata: {
              guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 3).toISOString()
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
          {
            metadata: {
              guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 4).toISOString()
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
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 5).toISOString()
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

        // first start: 0.5 GB
        // second start: 0.25 GB
        // buildpack_set events are ignored
        // scale out: 2 x 1 GB = 2GB
        expectedConsuming = 2;
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
          checkReport, pollOptions('applications', 9500), done);
      });
    });

    context('start, scale out, stop', () => {
      beforeEach(() => {
        appUsageEvents = [
          {
            metadata: {
              guid: 'b457f9e6-19f6-4263-9ffe-be39feccd576',
              url: '/v2/app_usage_events/b457f9e6-19f6-4263-9ffe-be39feccd576',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds).toISOString()
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
          {
            metadata: {
              guid: '0f2336af-1866-4d2b-8845-0efb14c1a388',
              url: '/v2/app_usage_events/0f2336af-1866-4d2b-8845-0efb14c1a388',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 1).toISOString()
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
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 2).toISOString()
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
          {
            metadata: {
              guid: '258ea444-943d-4a6e-9928-786a5bb93dfa',
              url: '/v2/app_usage_events/258ea444-943d-4a6e-9928-786a5bb93dfa',
              created_at: moment.utc(submittime -
                twentySecondsInMilliseconds + 3).toISOString()
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

        // first start: 1 GB
        // scale: 2x2GB = 4GB
        // buildpack_set events are ignored
        // stop: 0GB
        expectedConsuming = 0;
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
          checkReport, pollOptions('applications', 9500), done);
      });
    });

    const modifyEvents = (responseBody) => {
      const startTime = moment.now() - twentySecondsInMilliseconds;
      for(let resource of responseBody.resources)
        resource.metadata.created_at =
          moment.utc(startTime + resource.metadata.created_at).toISOString();

      return responseBody;
    };

    const buildAppUsageEvents = () => {
      const pathToEventsFile = path.format({
        dir: __dirname,
        base: 'appUsageEvents.json'
      });

      const events =
        modifyEvents(JSON.parse(fs.readFileSync(pathToEventsFile, 'utf-8')));
      debug('Built %d events', events.resources.length);

      return events.resources;
    };

    context('start, restage, restart', () => {
      beforeEach(() => {
        appUsageEvents = buildAppUsageEvents();

        // app uses 512MB
        expectedConsuming = 0.125;
      });

      it('submits usage and gets expected report back', function(done) {
        this.timeout(totalTimeout + 2000);

        client.waitForStartAndPoll('http://localhost::p/v1/cf/:component',
          checkReport, pollOptions('applications', 9500), done);
      });
    });

  });
});
