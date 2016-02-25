'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

const util = require('util');

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

// Skip tests requiring persistent DB
const runWithPersistentDB = process.env.DB ? it : it.skip;

const tests = (secured) => {
  let dbEnv;
  let reqmock;
  let bridge;
  let clock;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../paging.js')];
  };

  before(() => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach(() => {
    deleteModules();

    process.env.SECURED = secured ? 'true' : 'false';

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Mock the batch module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

    // Fake timer
    clock = sinon.useFakeTimers(Date.now());
  });

  afterEach(() => {
    if (bridge)
      bridge.stopReporting();

    // Restore timer
    clock.restore();

    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;

    reqmock = undefined;
    bridge = undefined;
    clock = undefined;
  });

  const generateUsageReport = (resourceId, instanceMemory, instances) => {
    return {
      start: 1439897300000,
      end: 1439897300000,
      organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
      space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
      resource_id: 'linux-container',
      plan_id: 'basic',
      resource_instance_id: resourceId,
      measured_usage: [
        {
          measure: 'instance_memory',
          quantity: instanceMemory
        },
        {
          measure: 'running_instances',
          quantity: instances
        }
      ]
    };
  };

  const checkUsageReport = (done, instanceMemory, instances) => {
    const args = reqmock.post.args;
    expect(args.length).to.equal(1);
    expect(args[0][0]).to.equal(':collector/v1/metering/collected/usage');
    expect(args[0][1]).to.contain.all.keys('collector', 'body');
    expect(args[0][1].collector).to.equal('http://collector');
    expect(args[0][1].body).to.contain.all.keys('usage');
    expect(args[0][1].body.usage.length).to.equal(1);
    expect(args[0][1].body.usage[0]).to.deep.equal(
      generateUsageReport('35c4ff2f', instanceMemory, instances));

    done();
  };

  const appUsagePageOne = {
    total_results: 2,
    total_pages: 2,
    prev_url: null,
    next_url: '/page2',
    resources: [
      {
        metadata: {
          guid: '904419c4',
          url: '/v2/app_usage_events/904419c4',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          memory_in_mb_per_instance: 512,
          instance_count: 1,
          app_guid: '35c4ff0f',
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
          guid: '904419c5',
          url: '/v2/app_usage_events/904419c5',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          memory_in_mb_per_instance: 512,
          instance_count: 1,
          app_guid: '35c4ff1f',
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
  const appUsagePageTwo = {
    total_results: 1,
    total_pages: 1,
    prev_url: null,
    next_url: null,
    resources: [
      {
        metadata: {
          guid: '904419c6',
          url: '/v2/app_usage_events/904419c4',
          created_at: '2015-08-18T11:28:20Z'
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
  };

  context('on non-empty usage event stream', () => {
    context('with multiple pages', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            else
              cb(null, { statusCode: 200, body: appUsagePageOne });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });

        // Run pending timers
        clock.tick(500);
      });

      const checkGetRequest = (expectedAPIOption, expectedURL, req) => {
        expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
        expect(req[1].api).to.equal(expectedAPIOption);
        expect(req[1].page).to.equal(expectedURL);
      };

      it('gets app usage events from API', (done) => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', '/v2/app_usage_events?' +
          'order-direction=asc&results-per-page=50', args[0]);
        checkGetRequest('http://api', '/page2', args[1]);

        done();
      });

      const checkPostRequest = (req, resourceId) => {
        expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
        expect(req[1]).to.contain.all.keys('collector', 'body');
        expect(req[1].collector).to.equal('http://collector');
        expect(req[1].body).to.contain.key('usage');
        expect(req[1].body.usage[0]).to.deep.equal(
          generateUsageReport(resourceId, 536870912, 1));
      };

      it('reports resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(3);
        checkPostRequest(args[0], '35c4ff0f');
        checkPostRequest(args[1], '35c4ff1f');
        checkPostRequest(args[2], '35c4ff2f');

        done();
      });
    });

    context('for started app', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: appUsagePageTwo });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');

        // Run pending timers
        clock.tick(500);
      });

      it('reports app usage event', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });

        checkUsageReport(done, 536870912, 1);
      });
    });

    context('for stopped app', () => {
      beforeEach(() => {
        const appUsagePage = clone(appUsagePageTwo);
        appUsagePage.resources[0].entity.state = 'STOPPED';

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: appUsagePage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');

        // Run pending timers
        clock.tick(500);
      });

      it('reports app usage event', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });

        checkUsageReport(done, 0, 0);
      });
    });
  });

  context('on empty usage event stream', () => {
    const appUsage = {
      total_results: 0,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: []
    };

    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(null, { statusCode: 200, body: appUsage });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');

      // Run pending timers
      clock.tick(500);
    });

    it('does not report app usage', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
        done(new Error(util.format('Unexpected error %s and response %j',
          error, response)));
      });

      expect(reqmock.post.args.length).to.equal(0);
      done();
    });
  });

  context('on failure', () => {
    let bridge;

    afterEach(() => {
      bridge = undefined;
    });

    const expectError = (expectedError, expectedResponse, done) => {
      return (err, response) => {
        expect(err).to.equal(expectedError);
        expect(response).to.deep.equal(expectedResponse);
        done();
      };
    };

    context('getting usage from CF, errors', () => {
      context('on fetching usage', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb('error', {});
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
        });

        it('errors', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError('error', {}, done));
        });
      });

      context('when unauthorized', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 401 });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
        });

        it('errors', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(null, { statusCode: 401 }, done));
        });
      });

      context('with missing CF oAuth Token', () => {
        beforeEach(() => {

          bridge = require('..');
        });

        it('errors', (done) => {
          bridge.reportAppUsage(() => undefined, abacusToken,
            expectError('Missing CF token', null, done));
        });
      });
    });

    context('posting usage to Abacus, errors', () => {
      context('on bad response code', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 500, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');

          // Run pending timers
          clock.tick(500);
        });

        it('errors', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, expectError(null,
            { statusCode: 500, body: {} }, done));
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken);

          expect(bridge.reportingConfig.currentRetries).to.equal(1);
          done();
        });
      });

      context('on error reporting usage', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb('error', {});
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');

          // Run pending timers
          clock.tick(500);
        });

        it('errors', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, expectError('error',
            {}, done));
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken);

          expect(bridge.reportingConfig.currentRetries).to.equal(1);
          done();
        });
      });

      context('when there are several failed requests', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              if (opts.page.indexOf('page2') > -1)
                cb(null, { statusCode: 200, body: appUsagePageTwo });
              else
                cb(null, { statusCode: 200, body: appUsagePageOne });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 201 });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');

          bridge.reportingConfig.currentRetries = 1;

          // Run pending timers
          clock.tick(500);
        });

        it('resets the retry count on successful request', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            done(new Error(util.format('Unexpected error %s and ' +
              'response %j', error, response)));
          });

          expect(bridge.reportingConfig.currentRetries).to.equal(0);
          done();
        });
      });

      context('when after_guid is not recognized', () => {
        let returnError = false;

        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              if (returnError)
                cb(null, {
                  statusCode: 400,
                  body: {
                    code: 10005,
                    description: 'The query parameter is invalid'
                  }
                });
              else
                cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 201 });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');

          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            done(new Error(util.format('Unexpected error %s and ' +
              'response %j', error, response)));

            // Run pending timers
            clock.tick(500);

            expect(bridge.cache.lastRecordedGUID).to.equal('35c4ff2f');
            done();
          });

          // Run pending timers
          clock.tick(500);
        });

        it('resets the last processed GUID', (done) => {
          returnError = true;
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            expect(error).to.equal(null);
            expect(response).to.deep.equal({
              statusCode: 400,
              body: {
                code: 10005,
                description: 'The query parameter is invalid'
              }
            });

            expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
            done();
          });
        });
      });

      context('with missing oAuth resource token', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 201, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');

          // Run pending timers
          clock.tick(500);
        });

        it('errors if token needed ', (done) => {
          if (secured)
            bridge.reportAppUsage(cfToken, undefined,
              expectError('Missing resource provider token', null, done));
          else {
            bridge.reportAppUsage(cfToken, undefined, (error, response) => {
              done(new Error(util.format('Unexpected error %s and ' +
                'response %j', error, response)));
            });

            // processed without error since no token needed
            done();
          }
        });
      });
    });
  });

  context('usage event listing', () => {
    const appUsage = {
      total_results: 1,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: [
        {
          metadata: {
            guid: '904419c6ddba',
            url: '/v2/app_usage_events/904419c4',
            created_at: new Date().toISOString()
          },
          entity: {
            state: 'STARTED',
            memory_in_mb_per_instance: 512,
            instance_count: 1,
            app_guid: '35c4ff0f',
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
    let bridge;

    context('when we just recorded guid', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at =
              new Date(new Date().getTime() - 5000).toISOString();
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.cache.lastRecordedGUID = null;

        // Run pending timers
        clock.tick(500);
      });

      it('does not update last recorded guid', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });

        expect(bridge.cache.lastRecordedGUID).to.equal(null);
        done();
      });
    });

    context('when we recorded the guid far back in time', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at =
              new Date(new Date().getTime() - 600000).toISOString();
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.cache.lastRecordedGUID = null;

        // Run pending timers
        clock.tick(500);
      });

      it('updates last recorded guid', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });

        expect(bridge.cache.lastRecordedGUID).to.equal('904419c6ddba');
        done();
      });
    });

    context('when report usage is called again', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at =
              new Date(new Date().getTime() - 600000).toISOString();
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.cache.lastRecordedGUID = null;

        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });

        // Run pending timers
        clock.tick(500);
      });

      it('uses the last recorded GUID', (done) => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);

        expect(args[1][1]).to.contain.key('page');
        expect(args[1][1].page).to.contain('after_guid=904419c6ddba');
        done();
      });
    });
  });

  context('when bridge is restarted', () => {
    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (opts.page.indexOf('page2') > -1)
            cb(null, { statusCode: 200, body: appUsagePageTwo });
          else
            cb(null, { statusCode: 200, body: appUsagePageOne });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      // Run pending timers
      clock.restore();

      // Store GUID in DB
      bridge = require('..');
      bridge.reportingConfig.minInterval = 10;
      bridge.initCache(() => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and ' +
            'response %j', error, response)));
        });
      });
    });

    runWithPersistentDB('uses the last recorded GUID', (done) => {
      setTimeout(() => {
        // Stop old bridge timers and reset modules
        bridge.stopReporting(() => deleteModules());

        bridge = require('..');
        bridge.initCache(() => {
          expect(bridge.cache.lastRecordedGUID).to.equal('904419c6');
          done();
        });
      }, 500);
    });
  });
};

describe('Report app usage without security', () => tests(false));

describe('Report app usage with security', () => tests(true));
