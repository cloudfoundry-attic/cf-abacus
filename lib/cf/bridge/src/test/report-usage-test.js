'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

// Skip tests requiring persistent DB
const runWithPersistentDB = process.env.DB ? it : it.skip;

const tests = (secured) => {
  let dbEnv;
  let reqmock;
  let bridge;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../paging.js')];

    cb();
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
  });

  afterEach(() => {
    if (bridge)
      bridge.stopReporting();

    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;

    reqmock = undefined;
    bridge = undefined;
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

  const expectError = (bridge, expectedError, expectedResponse, done) => {
    return (err, response) => {
      if (bridge)
        bridge.stopReporting();
      expect(err).to.equal(expectedError);
      expect(response).to.deep.equal(expectedResponse);
      done();
    };
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
        bridge.reportingConfig.minInterval = 5;
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();
          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);
        });
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
        bridge.reportingConfig.minInterval = 5;
      });

      it('reports app usage event', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();

          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);
          checkUsageReport(done, 536870912, 1);
        });
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
        bridge.reportingConfig.minInterval = 5;
      });

      it('reports app usage event', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();

          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);
          checkUsageReport(done, 0, 0);
        });
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
    let returnEmptyPage;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (returnEmptyPage)
            cb(null, { statusCode: 200, body: appUsage });
          else
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
      bridge.reportingConfig.minInterval = 5;

      returnEmptyPage = true;
    });

    it('does not report app usage', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
        bridge.stopReporting();

        expect(error).to.equal(undefined);
        expect(response).to.equal(undefined);

        expect(reqmock.post.args.length).to.equal(0);
        done();
      });
    });

    it('continues reporting on new app usage', (done) => {
      bridge.reportingConfig.minInterval = 5;

      bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
        expect(error).to.equal(undefined);
        expect(response).to.equal(undefined);

        if (returnEmptyPage) {
          returnEmptyPage = false;
          expect(reqmock.post.args.length).to.equal(0);
        }
        else {
          bridge.stopReporting();
          expect(reqmock.post.args.length).to.equal(3);
          done();
        }

      });
    });
  });

  context('on failure', () => {
    let bridge;

    afterEach(() => {
      bridge = undefined;
    });

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
          bridge.reportingConfig.minInterval = 5;
        });

        it('calls back with error', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, 'error', {}, done));
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
          bridge.reportingConfig.minInterval = 5;
        });

        it('calls back with error and response code', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, null, { statusCode: 401 }, done));
        });
      });

      context('with missing CF oAuth Token', () => {
        beforeEach(() => {

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5;
        });

        it('calls back with error', (done) => {
          bridge.reportAppUsage(() => undefined, abacusToken,
            expectError(bridge, 'Missing CF token', undefined, done));
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
          bridge.reportingConfig.minInterval = 5;
        });

        it('calls back with error and response code', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, null, { statusCode: 500, body: {} }, done));
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, () => {
            bridge.stopReporting();

            expect(bridge.reportingConfig.currentRetries).to.equal(1);
            done();
          });
        });
      });

      context('when reporting usage', () => {
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
          bridge.reportingConfig.minInterval = 5;
        });

        it('calls back with error and response', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, 'error', {}, done));
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, () => {
            bridge.stopReporting();

            expect(bridge.reportingConfig.currentRetries).to.equal(1);
            done();
          });
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
          bridge.reportingConfig.minInterval = 5;
          bridge.reportingConfig.currentRetries = 1;
        });

        it('resets the retry count on successful request', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            bridge.stopReporting();

            expect(error).to.equal(undefined);
            expect(response).to.equal(undefined);

            expect(bridge.reportingConfig.currentRetries).to.equal(0);
            done();
          })
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
          bridge.reportingConfig.minInterval = 5;
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            bridge.stopReporting();

            expect(error).to.equal(undefined);
            expect(response).to.equal(undefined);

            // Make spy, return an invalid query error
            returnError = true;
          });
        });

        it('resets the last processed data', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            bridge.stopReporting();

            expect(error).to.equal(null);
            expect(response).to.deep.equal({
              statusCode: 400,
              body: {
                code: 10005,
                description: 'The query parameter is invalid'
              }
            });

            expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
            expect(bridge.cache.lastRecordedTimestamp).to.equal(undefined);
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
          bridge.reportingConfig.minInterval = 5;
        });

        it('errors if token needed ', (done) => {
          if (secured)
            bridge.reportAppUsage(cfToken, undefined,
              expectError(bridge, 'Missing resource provider token',
                null, done));
          else
            bridge.reportAppUsage(cfToken, undefined, (error, response) => {
              bridge.stopReporting();

              expect(error).to.equal(undefined);
              expect(response).to.equal(undefined);
              done();
            });
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
            created_at: '0'
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
      const date = new Date(new Date().getTime() - 5000).toISOString();

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at = date;
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.reportingConfig.minInterval = 5;
      });

      it('does not update last recorded data', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();

          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);

          expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
          expect(bridge.cache.lastRecordedTimestamp).to.equal(undefined);
          done();
        });
      });
    });

    context('when we recorded the guid far back in time', () => {
      const date = new Date(new Date().getTime() - 600000).toISOString();

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at = date;
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.reportingConfig.minInterval = 5;
      });

      it('updates last recorded data', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();

          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);

          expect(bridge.cache.lastRecordedGUID).to.equal('904419c6ddba');
          expect(bridge.cache.lastRecordedTimestamp).to.equal(date);
          done();
        });
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
        bridge.reportingConfig.minInterval = 5;
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();

          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);
        });
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          bridge.stopReporting();

          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);
        });
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
    });

    runWithPersistentDB('uses the last recorded GUID and timestamp', (done) => {
      // Store GUID in DB
      bridge = require('..');
      bridge.reportingConfig.minInterval = 5;
      bridge.initCache(() => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          expect(error).to.equal(undefined);
          expect(response).to.equal(undefined);
          deleteModules();
        });
      });

      // Wait for the cache timer to kick in
      setTimeout(() => {
        bridge = require('..');
        bridge.initCache(() => {
          expect(bridge.cache.lastRecordedGUID).to.equal('904419c6');
          expect(bridge.cache.lastRecordedTimestamp).
            to.equal('2015-08-18T11:28:20Z');
          done();
        });
      }, 500);

    });
  });
};

describe('Report app usage without security', () => tests(false));

describe('Report app usage with security', () => tests(true));
