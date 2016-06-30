'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;

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
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  before((done) => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';

    // Delete test dbs on the configured db server
    require('abacus-dbclient').drop(
      process.env.DB, /^abacus-cf-bridge-/, done);
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

  const generateUsageReport = (appId, resourceId, currentInstanceMemory,
                               currentInstances, previousInstanceMemory,
                               previousInstances) => {
    return {
      start: 1439897300000,
      end: 1439897300000,
      organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
      space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
      consumer_id: 'app:' + appId,
      resource_id: 'linux-container',
      plan_id: 'standard',
      resource_instance_id: resourceId,
      measured_usage: [
        {
          measure: 'current_instance_memory',
          quantity: currentInstanceMemory
        },
        {
          measure: 'current_running_instances',
          quantity: currentInstances
        },
        {
          measure: 'previous_instance_memory',
          quantity: previousInstanceMemory
        },
        {
          measure: 'previous_running_instances',
          quantity: previousInstances
        }
      ]
    };
  };

  const checkUsageReport = (done, appId, resourceId, currentInstanceMemory,
                            currentInstances, previousInstanceMemory,
                            previousInstances) => {
    const args = reqmock.post.args;
    expect(args.length).to.equal(1);
    expect(args[0][0]).to.equal(':collector/v1/metering/collected/usage');
    expect(args[0][1]).to.contain.all.keys('collector', 'body');
    expect(args[0][1].collector).to.equal('http://collector');
    expect(args[0][1].body).to.deep.equal(
      generateUsageReport(appId, resourceId,
                          currentInstanceMemory, currentInstances,
                          previousInstanceMemory, previousInstances));
    done();
  };

  const expectError = (bridge, expectedError, expectedResponse, done) => {
    return {
      failure: (error, response) => {
        if (bridge)
          bridge.stopReporting();
        expect(error).to.equal(expectedError);
        expect(response).to.deep.equal(expectedResponse);
        done();
      },
      success: () => {
        done(new Error('Unexpected call of success'));
      }
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
          previous_state: 'STOPPED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 256,
          instance_count: 1,
          previous_instance_count: 2,
          app_guid: '35c4ff0f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
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
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 256,
          instance_count: 1,
          previous_instance_count: 2,
          app_guid: '35c4ff1f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
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
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 256,
          instance_count: 1,
          previous_instance_count: 2,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
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
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();
          }
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

      const checkPostRequest = (req, appId, resourceId) => {
        expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
        expect(req[1]).to.contain.all.keys('collector', 'body');
        expect(req[1].collector).to.equal('http://collector');
        expect(req[1].body).to.deep.equal(
          generateUsageReport(appId, resourceId, 536870912, 1, 268435456, 2));
      };

      it('reports resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(3);
        checkPostRequest(args[0], '35c4ff0f', '904419c4');
        checkPostRequest(args[1], '35c4ff1f', '904419c5');
        checkPostRequest(args[2], '35c4ff2f', '904419c6');

        done();
      });
    });

    context('with single page', () => {
      context('for starting app', () => {
        beforeEach(() => {
          // Deep-clone page two
          const appUsagePage = JSON.parse(JSON.stringify(appUsagePageTwo));
          const resourceEntity = appUsagePage.resources[0].entity;
          resourceEntity.previous_state = 'STOPPED';
          resourceEntity.previous_instance_count = 0;
          resourceEntity.previous_memory_in_mb_per_instance = 0;

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
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %o and response %j', error, response)));
            },
            success: () => {
              bridge.stopReporting();
              checkUsageReport(done, '35c4ff2f', '904419c6',
                536870912, 1, 0, 0);
            }
          });
        });
      });

      context('for scaling app', () => {
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
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %o and response %j', error, response)));
            },
            success: () => {
              bridge.stopReporting();
              checkUsageReport(done, '35c4ff2f', '904419c6',
                536870912, 1, 268435456, 2);
            }
          });
        });
      });

      context('for stopping app', () => {
        beforeEach(() => {
          // Deep-clone page two
          const appUsagePage = JSON.parse(JSON.stringify(appUsagePageTwo));
          const resourceEntity = appUsagePage.resources[0].entity;
          resourceEntity.state = 'STOPPED';

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
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %o and response %j', error, response)));
            },
            success: () => {
              bridge.stopReporting();
              checkUsageReport(done, '35c4ff2f', '904419c6',
                0, 0, 268435456, 2);
            }
          });
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
      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %o and response %j', error, response)));
        },
        success: () => {
          bridge.stopReporting();
          expect(reqmock.post.args.length).to.equal(0);
          done();
        }
      });
    });

    it('continues reporting on new app usage', (done) => {
      bridge.reportingConfig.minInterval = 5;

      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %o and response %j', error, response)));
        },
        success: () => {
          if (returnEmptyPage) {
            returnEmptyPage = false;
            expect(reqmock.post.args.length).to.equal(0);
          }
          else {
            bridge.stopReporting();
            expect(reqmock.post.args.length).to.equal(3);
            done();
          }
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
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              done(new Error('Unexpected call of success'));
            },
            failure: () => {
              bridge.stopReporting();

              expect(bridge.reportingConfig.currentRetries).to.equal(1);
              done();
            }
          });
        });
      });

      context('on 409 response code', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 409, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5;
        });

        it('calls back with success', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: () => {
              done(new Error('Unexpected call of failure'));
            },
            success: () => {
              bridge.stopReporting();
              done();
            }
          });
        });

        it('increases the conflict count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: () => {
              done(new Error('Unexpected call of failure'));
            },
            success: () => {
              bridge.stopReporting();

              expect(bridge.statistics.usage.reportConflict).to.equal(1);
              done();
            }
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
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: () => {
              bridge.stopReporting();

              expect(bridge.reportingConfig.currentRetries).to.equal(1);
              done();
            },
            success: () => {
              done(new Error('Unexpected call of success'));
            }
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
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();

              expect(bridge.reportingConfig.currentRetries).to.equal(0);
              done();
            },
            failure: (error, response) => {
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %o and response %j', error, response)));
            }
          });
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
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();
              // Make spy return an invalid query error
              returnError = true;
            },
            failure: (error, response) => {
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %o and response %j', error, response)));
            }
          });
        });

        it('resets the last processed data', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
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
            },
            success: () => {
              done(new Error('Unexpected call of success'));
            }
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
            bridge.reportAppUsage(cfToken, () => undefined,
              expectError(bridge, 'Missing resource provider token',
                null, done));
          else
            bridge.reportAppUsage(cfToken, () => undefined, {
              failure: (error, response) => {
                done(new Error(util.format('Unexpected call of failure with ' +
                  'error %o and response %j', error, response)));
              }, success: () => {
                bridge.stopReporting();
                done();
              }
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
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();

            expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
            expect(bridge.cache.lastRecordedTimestamp).to.equal(undefined);
            expect(bridge.statistics.usage.loopSkip).to.equal(1);
            done();
          }
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
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();

            expect(bridge.cache.lastRecordedGUID).to.equal('904419c6ddba');
            expect(bridge.cache.lastRecordedTimestamp).to.equal(date);
            expect(bridge.statistics.usage.loopSkip).to.equal(0);
            done();
          }
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
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();

            expect(error).to.equal(undefined);
            expect(response).to.equal(undefined);
          }
        });
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();
          }
        });
      });

      it('uses the last recorded GUID', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);

        expect(args[1][1]).to.contain.key('page');
        expect(args[1][1].page).to.contain('after_guid=904419c6ddba');
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
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            deleteModules();
          }
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
