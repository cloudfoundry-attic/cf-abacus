'use strict';

const _ = require('underscore');
const extend = _.extend;

// Configure COLLECTOR and API URLs
process.env.COLLECTOR = 'http://collector';
process.env.API = 'http://api';
process.env.UAA = 'http://uaa';

describe('Purge compensation', () => {
  const expectedCompensatedUsage1 = {
    usage: [
      {
        start: 1439897300000,
        end: 1439897300000,
        region: 'eu-gb',
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
        space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
        resource_id: 'linux-container',
        plan_id: 'basic',
        resource_instance_id: '35c4ff2f',
        measured_usage: [
          {
            measure: 'instance_memory',
            quantity: 0
          },
          {
            measure: 'running_instances',
            quantity: 0
          }
        ]
      }
    ]
  };
  const expectedCompensatedUsage2 = {
    usage: [
      {
        start: 1439897300000,
        end: 1439897300000,
        region: 'eu-gb',
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
        space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
        resource_id: 'linux-container',
        plan_id: 'basic',
        resource_instance_id: '35c4ff3f',
        measured_usage: [
          {
            measure: 'instance_memory',
            quantity: 0
          },
          {
            measure: 'running_instances',
            quantity: 0
          }
        ]
      }
    ]
  };

  let reqmock;
  let bridge;
  let sandbox;

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
  });

  afterEach(() => {
    sandbox.restore();

    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../oauth.js')];
    delete require.cache[require.resolve('../paging.js')];

    bridge = undefined;
    reqmock = undefined;
  });

  const checkCompensationRequest = (req, usage) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.key('collector', 'body');
    expect(req[1].collector).to.equal('http://collector');
    expect(req[1].body).to.eql(usage);
  };

  context('on success', () => {
    context('for STARTED app usage event', () => {
      let purgedAppUsagePageOne;
      let purgedAppUsagePageTwo;

      beforeEach(() => {
        purgedAppUsagePageOne = {
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
        purgedAppUsagePageTwo = {
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
                memory_in_mb_per_instance: 512,
                instance_count: 1,
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
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

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
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal(null);
          expect(response.statusCode).to.equal(200);
        });

        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkPage(args[0], '/v2/app_usage_events?' +
            'order-direction=asc&results-per-page=50');
          checkPage(args[1], '/page2?param=1');

          done();
        }, 50);
      });

      it('receives correct usage response', (done) => {
        bridge.purgeCompensation((err, response) => {
          expect(err).to.equal(null);
          expect(response).not.to.equal(null);
          expect(response.statusCode).to.equal(200);
        });

        setTimeout(() => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);

          done();
        }, 50);
      });

      it('generates correct usage reporting request', (done) => {
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal(null);
          expect(response.statusCode).to.equal(200);
        });

        setTimeout(() => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkCompensationRequest(args[0], expectedCompensatedUsage1);
          checkCompensationRequest(args[1], expectedCompensatedUsage2);

          done();
        }, 50);
      });

      it('remembers the last processed guid', (done) => {
        bridge.purgeCompensation();

        setTimeout(() => {
          expect(bridge.cache.lastCompensatedGUID).to.equal('35c4ff3f');
          done();
        }, 50);
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

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: purgedAppUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        bridge = require('..');
      });

      it('generates no compensation usage reporting request',
        (done) => {
          bridge.purgeCompensation((error) => {
            done(error);
          });

          setTimeout(() => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(0);

            done();
          }, 50);
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
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        bridge = require('..');
      });

      it('returns an error', (done) => {
        bridge.purgeCompensation((error) => {
          expect(error).to.equal('error');
          done();
        });
      });

      it('generates no usage reporting request', (done) => {
        bridge.purgeCompensation(() => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(0);
          done();
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
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        bridge = require('..');
      });

      it('returns the bad response', (done) => {
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal(null);
          expect(response.statusCode).to.equal(500);
          done();
        });
      });

      it('generates no usage reporting request', (done) => {
        bridge.purgeCompensation(() => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(0);
          done();
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
            },
            {
              metadata: {
                guid: '35c4ff3f',
                url: '/v2/app_usage_events/904419c5',
                created_at: '2015-08-18T11:28:20Z'
              },
              entity: {
                state: 'STARTED',
                memory_in_mb_per_instance: 512,
                instance_count: 1,
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
              cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        bridge = require('..');
      });

      it('remembers the last processed guid', (done) => {
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal('error');
          expect(response).to.equal(null);

          returnError = false;
          setTimeout(() => {
            expect(bridge.cache.lastCompensatedGUID).to.equal('35c4ff3f');
            done();
          }, 50);
        });
      });

      it('retries', (done) => {
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal('error');
          expect(response).to.equal(null);

          returnError = false;
          setTimeout(() => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(3);
            checkCompensationRequest(args[0], expectedCompensatedUsage1);
            checkCompensationRequest(args[1], expectedCompensatedUsage1);
            checkCompensationRequest(args[2], expectedCompensatedUsage2);

            done();
          }, 50);
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

        returnError = true;

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: purgedAppUsage });
          }),
          post: spy((uri, opts, cb) => {
            if (returnError)
              cb(null, { statusCode: 500, body: {} });
            else
              cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        bridge = require('..');
      });

      it('remembers the last processed guid', (done) => {
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal(null);
          expect(response).to.eql({ statusCode: 500, body: {} });

          returnError = false;
          setTimeout(() => {
            expect(bridge.cache.lastCompensatedGUID).to.equal('35c4ff2f');
            done();
          }, 50);
        });
      });

      it('retries', (done) => {
        bridge.purgeCompensation((error, response) => {
          expect(error).to.equal(null);
          expect(response).to.eql({ statusCode: 500, body: {} });

          returnError = false;
          setTimeout(() => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(2);
            checkCompensationRequest(args[0], expectedCompensatedUsage1);
            checkCompensationRequest(args[1], expectedCompensatedUsage1);

            done();
          }, 50);
        });
      });
    });
  });

});
