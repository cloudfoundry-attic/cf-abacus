'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

const util = require('util');

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const tests = (secured) => {
  let reqmock;
  let bridge;
  let sandbox;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  beforeEach(() => {
    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Mock the batch module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

    // Stub timeout with immediate
    sandbox = sinon.sandbox.create();
    sandbox.stub(global, 'setTimeout', setImmediate);

    process.env.SECURED = secured ? 'true' : 'false';
  });

  afterEach(() => {
    sandbox.restore();

    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../paging.js')];

    bridge = undefined;
    reqmock = undefined;
    sandbox = undefined;
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
            'response code %s', error, response)));
        });
      });

      const checkGetRequest = (expectedAPIOption, expectedURL, req) => {
        expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
        expect(req[1].api).to.equal(expectedAPIOption);
        expect(req[1].page).to.equal(expectedURL);
      };

      it('gets app usage events from API', (done) => {
        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest('http://api', '/v2/app_usage_events?' +
            'order-direction=asc&results-per-page=50', args[0]);
          checkGetRequest('http://api', '/page2', args[1]);

          done();
        }, 50);
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
        setTimeout(() => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(3);
          checkPostRequest(args[0], '35c4ff0f');
          checkPostRequest(args[1], '35c4ff1f');
          checkPostRequest(args[2], '35c4ff2f');

          done();
        }, 50);
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
      });

      it('reports app usage event', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and response code %s',
            error, response)));
        });

        setTimeout(() => {
          checkUsageReport(done, 536870912, 1);
        }, 50);
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
      });

      it('reports app usage event', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and response code %s',
            error, response)));
        });

        setTimeout(() => {
          checkUsageReport(done, 0, 0);
        }, 50);
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
    });

    it('does not report app usage', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
        done(new Error(util.format('Unexpected error %s and response code %s',
          error, response)));
      });

      setTimeout(() => {
        expect(reqmock.post.args.length).to.equal(0);
        done();
      }, 50);
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
        });

        it('errors', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, expectError(null,
            { statusCode: 500, body: {} } ,done));
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken);

          setTimeout(() => {
            expect(bridge.reportingConfig.currentRetries).to.equal(1);
            done();
          }, 50);
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
        });

        it('errors', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, expectError('error',
            {}, done));
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken);

          setTimeout(() => {
            expect(bridge.reportingConfig.currentRetries).to.equal(1);
            done();
          }, 50);
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
        });

        it('resets the retry count on successful request', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            done(new Error(util.format('Unexpected error %s and ' +
              'response code %j', error, response)));
          });

          setTimeout(() => {
            expect(bridge.reportingConfig.currentRetries).to.equal(0);
            done();
          }, 50);
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
              'response code %j', error, response)));

            setTimeout(() => {
              expect(bridge.cache.lastRecordedGUID).to.equal('35c4ff2f');
              done();
            }, 50);
          });
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

            setTimeout(() => {
              expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
              done();
            }, 50);
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
        });

        it('errors if token needed ', (done) => {
          if (secured)
            bridge.reportAppUsage(cfToken, undefined,
              expectError('Missing resource provider token', null, done));
          else {
            bridge.reportAppUsage(cfToken, undefined, (error, response) => {
              done(new Error(util.format('Unexpected error %s and ' +
                'response code %s', error, response)));
            });

            setTimeout(() => {
              // processed without error since no token needed
              done();
            }, 50);
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
      });

      it('does not update last recorded guid', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and response code %s',
            error, response)));
        });

        setTimeout(() => {
          expect(bridge.cache.lastRecordedGUID).to.equal(null);
          done();
        }, 50);
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
      });

      it('updates last recorded guid', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
          done(new Error(util.format('Unexpected error %s and response code %s',
            error, response)));
        });

        setTimeout(() => {
          expect(bridge.cache.lastRecordedGUID).to.equal('904419c6ddba');
          done();
        }, 50);
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
            'response code %s', error, response)));
        });
        setTimeout(() => {
          bridge.reportAppUsage(cfToken, abacusToken, (error, response) => {
            done(new Error(util.format('Unexpected error %s and ' +
              'response code %s', error, response)));
          });
        }, 50);
      });

      it('uses the last recorded GUID', (done) => {
        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);

          expect(args[1][1]).to.contain.key('page');
          expect(args[1][1].page).to.contain('after_guid=904419c6ddba');
          done();
        }, 50);
      });
    });
  });
};

describe('Report app usage', () => {
  context('without security', () => tests(false));
  context('with security', () => tests(true));
});
