'use strict';

const util = require('util');
const moment = require('abacus-moment');

const _ = require('underscore');
const extend = _.extend;

// Configure COLLECTOR and API URLs
process.env.COLLECTOR = 'http://collector';
process.env.API = 'http://api';

describe('Purge compensation', () => {
  const expectedCompensatedUsage1 = {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff2f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff2f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 0
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 268435456
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  };
  const expectedCompensatedUsage2 = {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff3f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff3f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 0
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  };

  let dbEnv;
  let reqmock;
  let bridge;
  let clock;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-carryover')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('abacus-client')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
  };

  before(() => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach((done) => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');

    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);
    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');

    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    // Delete test dbs on the configured db server
    const dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB, /^abacus-cf-bridge-/, () => {
      dbclient.drop(process.env.DB, /^abacus-carry-over-/, done);
    });
  });

  afterEach(() => {
    if (bridge)
      bridge.stopReporting();
    if (clock)
      clock.restore();

    deleteModules();
  });

  const checkCompensationRequest = (req, usage) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.key('collector', 'body');
    expect(req[1].collector).to.equal('http://collector');
    expect(req[1].body).to.deep.equal(usage);
  };

  const purgedAppUsagePageOne = {
    total_results: 1,
    total_pages: 2,
    prev_url: null,
    next_url: '/page2?param=1',
    resources: [
      {
        metadata: {
          guid: '35c4ff2f',
          url: '/v2/app_usage_events/904419c4',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 256,
          instance_count: 1,
          previous_instance_count: 1,
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
  };
  const purgedAppUsagePageTwo = {
    total_results: 1,
    total_pages: 1,
    prev_url: '/page1',
    next_url: null,
    resources: [
      {
        metadata: {
          guid: '35c4ff3f',
          url: '/v2/app_usage_events/904419c5',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STOPPED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '35c4ff3f',
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
  };

  context('on success', () => {
    context('for STARTED app usage event', () => {

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 200, body: purgedAppUsagePageTwo });
            else
              cb(null, { statusCode: 200, body: purgedAppUsagePageOne });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              headers: { location: 'some location' },
              body: {}
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      const checkPage = (req, expectedURLPage) => {
        expect(req[1]).to.contain.all.keys('page', 'api', 'headers');
        expect(req[1].page).to.equal(expectedURLPage);
        expect(req[1].api).to.equal('http://api');
        expect(req[1].headers).to.contain.all.keys('Authorization');
        expect(req[1].headers.Authorization).to.equal('token');
      };

      it('generates correct usage request', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          success: () => {
            const args = reqmock.get.args;
            expect(args.length).to.equal(2);
            checkPage(args[0], '/v2/app_usage_events?' +
              'order-direction=asc&results-per-page=50');
            checkPage(args[1], '/page2?param=1');

            done();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          }
        });
      });

      it('receives correct usage response', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          success: () => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(2);

            done();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          }
        });
      });

      it('generates correct usage reporting request', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          success: () => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(2);
            checkCompensationRequest(args[0], expectedCompensatedUsage1);
            checkCompensationRequest(args[1], expectedCompensatedUsage2);
            done();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          }
        });
      });

      it('remembers the last processed guid and timestamp', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          success: () => {
            expect(bridge.cache.lastCompensatedGUID).
              to.equal('35c4ff3f');
            expect(bridge.cache.lastCompensatedTimestamp).
              to.equal('2015-08-18T11:28:20Z');
            done();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          }
        });
      });
    });

    context('for STOPPED app usage event', () => {
      let purgedAppUsage;

      beforeEach(() => {
        purgedAppUsage = {
          total_results: 1,
          total_pages: 1,
          prev_url: null,
          next_url: null,
          resources: [
            {
              metadata: {
                guid: '904419c4',
                url: '/v2/app_usage_events/904419c4',
                created_at: '2015-08-18T11:28:20Z'
              },
              entity: {
                state: 'STOPPED',
                previous_state: 'STOPPED',
                memory_in_mb_per_instance: 512,
                previous_memory_in_mb_per_instance: 512,
                instance_count: 1,
                previous_instance_count: 1,
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
        };

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: purgedAppUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      it('generates no compensation usage reporting request', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          success: () => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(0);

            done();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          }
        });
      });
    });
  });

  context('on failure', () => {
    context('caused by error getting usage events', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb('error', null);
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      it('returns an error', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            expect(error).to.equal('error');
            expect(response).to.equal(null);
            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });

      it('generates no usage reporting request', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(0);
            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });

    context('caused by bad response when getting usage events', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 500, body: {} });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      it('returns the bad response', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            expect(error).to.equal(null);
            expect(response.statusCode).to.equal(500);
            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });

      it('generates no usage reporting request', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(0);
            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });

    context('caused by error when reporting usage', () => {
      let purgedAppUsage;
      let returnError;

      beforeEach(() => {
        purgedAppUsage = {
          total_results: 2,
          total_pages: 1,
          prev_url: null,
          next_url: null,
          resources: [
            {
              metadata: {
                guid: '35c4ff2f',
                url: '/v2/app_usage_events/904419c4',
                created_at: '2015-08-18T11:28:20Z'
              },
              entity: {
                state: 'STARTED',
                previous_state: 'STARTED',
                memory_in_mb_per_instance: 512,
                previous_memory_in_mb_per_instance: 256,
                instance_count: 1,
                previous_instance_count: 1,
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
            },
            {
              metadata: {
                guid: '35c4ff3f',
                url: '/v2/app_usage_events/904419c5',
                created_at: '2015-08-18T11:28:20Z'
              },
              entity: {
                state: 'STARTED',
                previous_state: 'STOPPED',
                memory_in_mb_per_instance: 512,
                previous_memory_in_mb_per_instance: 512,
                instance_count: 1,
                previous_instance_count: 1,
                app_guid: '35c4ff3f',
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
        };

        returnError = true;

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: purgedAppUsage });
          }),
          post: spy((uri, opts, cb) => {
            if (returnError)
              cb('error', null);
            else
              cb(null, {
                statusCode: 201,
                headers: { location: 'some location' },
                body: {}
              });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');

        // Fake timer
        clock = sinon.useFakeTimers(moment.utc().valueOf());
      });

      it('remembers the last processed guid and timestamp', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            expect(error).to.equal('error');
            expect(response).to.equal(null);

            expect(returnError).to.equal(true);
            returnError = false;

            // Run pending timers - force retry to trigger
            clock.tick(bridge.compensationConfig.minInterval);
          },
          success: () => {
            expect(returnError).to.equal(false);
            expect(bridge.cache.lastCompensatedGUID).
              to.equal('35c4ff3f');
            expect(bridge.cache.lastCompensatedTimestamp).
              to.equal('2015-08-18T11:28:20Z');
            done();
          }
        });
      });

      it('retries', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            expect(error).to.equal('error');
            expect(response).to.equal(null);

            returnError = false;

            // Run pending timers - force retry to trigger
            clock.tick(bridge.compensationConfig.minInterval);
          },
          success: () => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(3);
            checkCompensationRequest(args[0], expectedCompensatedUsage1);
            checkCompensationRequest(args[1], expectedCompensatedUsage1);
            checkCompensationRequest(args[2], expectedCompensatedUsage2);

            done();
          }
        });
      });
    });

    context('caused by bad response when reporting usage', () => {
      let purgedAppUsage;
      let returnError;

      beforeEach(() => {
        purgedAppUsage = {
          total_results: 1,
          total_pages: 1,
          prev_url: null,
          next_url: null,
          resources: [
            {
              metadata: {
                guid: '35c4ff2f',
                url: '/v2/app_usage_events/904419c4',
                created_at: '2015-08-18T11:28:20Z'
              },
              entity: {
                state: 'STARTED',
                previous_state: 'STARTED',
                memory_in_mb_per_instance: 512,
                previous_memory_in_mb_per_instance: 256,
                instance_count: 1,
                previous_instance_count: 1,
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
        };

        returnError = true;

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: purgedAppUsage });
          }),
          post: spy((uri, opts, cb) => {
            if (returnError) {
              cb(null, { statusCode: 500, body: {} });

              // Run pending timers - force retry to trigger
              clock.tick(bridge.compensationConfig.minInterval);
            }
            else {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });

              // Run pending timers - force retry to trigger
              clock.tick(bridge.compensationConfig.minInterval);
            }
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');

        // Fake timer
        clock = sinon.useFakeTimers(moment.utc().valueOf());
      });

      it('remembers the last processed guid and timestamp', (done) => {
        const startTime = moment.now();

        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            expect(error).to.not.equal(undefined);
            expect(response).to.deep.equal({ statusCode: 500, body: {} });

            expect(returnError).to.equal(true);
            returnError = false;

            expect(bridge.errors.lastError)
              .to.match(/^Error reporting compensating usage/);

            const errorTime = moment.utc(bridge.errors.lastErrorTimestamp)
              .valueOf();
            expect(errorTime).to.be.at.least(startTime);

            // Run pending timers - force retry to trigger
            clock.tick(bridge.compensationConfig.minInterval);
          },
          success: () => {
            expect(returnError).to.equal(false);

            expect(bridge.cache.lastCompensatedGUID).
              to.equal('35c4ff2f');
            expect(bridge.cache.lastCompensatedTimestamp).
              to.equal('2015-08-18T11:28:20Z');
            done();
          }
        });
      });

      it('retries', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            expect(error).to.not.equal(undefined);
            expect(response).to.deep.equal({ statusCode: 500, body: {} });

            expect(returnError).to.equal(true);
            returnError = false;

            // Run pending timers
            clock.tick(bridge.compensationConfig.minInterval);
          },
          success: () => {
            expect(returnError).to.equal(false);

            const args = reqmock.post.args;
            expect(args.length).to.equal(2);
            checkCompensationRequest(args[0], expectedCompensatedUsage1);
            checkCompensationRequest(args[1], expectedCompensatedUsage1);

            done();
          }
        });
      });
    });

    context('caused by 409 response when reporting usage', () => {
      let purgedAppUsage;

      beforeEach(() => {
        purgedAppUsage = {
          total_results: 1,
          total_pages: 1,
          prev_url: null,
          next_url: null,
          resources: [
            {
              metadata: {
                guid: '35c4ff2f',
                url: '/v2/app_usage_events/904419c4',
                created_at: '2015-08-18T11:28:20Z'
              },
              entity: {
                state: 'STARTED',
                previous_state: 'STARTED',
                memory_in_mb_per_instance: 512,
                previous_memory_in_mb_per_instance: 256,
                instance_count: 1,
                previous_instance_count: 1,
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
        };

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: purgedAppUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 409,
              headers: { location: 'some location' },
              body: {
                error: 'conflict',
                reason: 'Conflict! Do not retry',
                noretry: true
              }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      it('returns with success', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          },
          success: () => {
            done();
          }
        });
      });

      it('increases conflict counter', (done) => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          },
          success: () => {
            expect(bridge.statistics.compensation.usageConflict).to.equal(1);
            done();
          }
        });
      });
    });
  });

  context('when bridge is restarted', () => {

    beforeEach(() => {
      const purgedAppUsagePageOne = {
        total_results: 1,
        total_pages: 2,
        prev_url: null,
        next_url: '/page2?param=1',
        resources: [
          {
            metadata: {
              guid: '35c4ff2f',
              url: '/v2/app_usage_events/904419c4',
              created_at: '2015-08-18T11:28:20Z'
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
      };
      const purgedAppUsagePageTwo = {
        total_results: 1,
        total_pages: 1,
        prev_url: '/page1',
        next_url: null,
        resources: [
          {
            metadata: {
              guid: '35c4ff3f',
              url: '/v2/app_usage_events/904419c5',
              created_at: '2015-08-18T11:28:20Z'
            },
            entity: {
              state: 'STARTED',
              previous_state: 'STARTED',
              memory_in_mb_per_instance: 512,
              previous_memory_in_mb_per_instance: 512,
              instance_count: 1,
              previous_instance_count: 1,
              app_guid: '35c4ff3f',
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
      };

      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (opts.page.indexOf('page2') > -1)
            cb(null, { statusCode: 200, body: purgedAppUsagePageTwo });
          else
            cb(null, { statusCode: 200, body: purgedAppUsagePageOne });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 201,
            headers: { location: 'some location' },
            body: {}
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;
    });

    it('uses the last processed data', (done) => {
      // Start purging to store lastCompensatedGUID
      bridge = require('..');
      bridge.reportingConfig.minInterval = 10;
      bridge.initCache(() => {
        bridge.purgeCompensation(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          },
          success: () => {
            deleteModules();

            expect(bridge.cache.lastCompensatedGUID).
              to.equal('35c4ff3f');
            expect(bridge.cache.lastCompensatedTimestamp).
              to.equal('2015-08-18T11:28:20Z');

            done();
          }
        });
      });
    });
  });
});
