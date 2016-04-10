'use strict';

// Usage collector service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const yieldable = require('abacus-yieldable');

const omit = _.omit;
const extend = _.extend;

const brequest = batch(request);

// Configure test db URL prefix and splitter and provisioning service URLs
process.env.DB = process.env.DB || 'test';
process.env.METER = 'http://localhost:9100';
process.env.PROVISIONING = 'http://localhost:9880';
process.env.ACCOUNT = 'http://localhost:9881';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
let getspy, postspy;
const reqmock = extend({}, request, {
  batch_get: (reqs, cb) => getspy(reqs, cb),
  batch_post: (reqs, cb) => postspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
let validatorspy, authorizespy, cachespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope),
  cache: () => cachespy(),
  getUserInfo: () => ({ client_id: 'anonymous' })
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const collector = require('..');

describe('abacus-usage-collector', () => {
  it('stores and retrieves resource usage data', (done) => {

    const verify = (secured, done) => {

      const usage = {
        start: 1420243200000 + (secured ? 1 : 0),
        end: 1420245000000 + (secured ? 1 : 0),
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'test-resource',
        plan_id: 'basic',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        measured_usage: [{
          measure: 'light_api_calls',
          quantity: 12
        }]
      };

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });

      // Create a test collector app
      const app = collector();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 4) done();
      };

      getspy = (reqs, cb) => {
        // Expect a call to the provisioning service's validate
        if(reqs[0][0] === 
          'http://localhost:9880/v1/provisioning/organizations/' +
          ':organization_id/spaces/:space_id/consumers/:consumer_id/' +
          'resources/:resource_id/plans/:plan_id/instances/' +
          ':resource_instance_id/:time') {
          expect(omit(reqs[0][1],
            'id', 'processed', 'processed_id')).to.deep.equal(
            extend({}, usage, {
              time: usage.end
            }, secured));
          cb(undefined, [[undefined, {
            statusCode: 200
          }]]);

          check();
        }

        // Expect a call to the provisioning service's get resource type
        if(reqs[0][0] === 'http://localhost:9880/v1/provisioning/' +
          'resources/:resource_id/type') {
          expect(reqs[0][1]).to.deep.equal({
            resource_id: usage.resource_id,
            cache: true
          });

          // The second call to account is cached
          if(reqs[1]) {
            expect(reqs[1][0]).to.equal('http://localhost:9881/v1/' +
              'organizations/:org_id/account/:time');
            expect(reqs[1][1]).to.deep.equal(extend({}, {
              org_id: usage.organization_id,
              time: usage.end
            }));
            cb(undefined, [[undefined, {
              statusCode: 200,
              body: 'test-resource'
            }], [undefined, {
              statusCode: 200,
              body: {
                account_id: 'test-account',
                pricing_country: 'USA'
              }
            }]]);

            check();
          }
          else {
            cb(undefined, [[undefined, {
              statusCode: 200,
              body: 'test-resource'
            }]]);

            check();
          }
        }
      };

      postspy = (reqs, cb) => {
        // Expect usage to be posted to the meter service
        expect(reqs[0][0]).to.equal(
          'http://localhost:9100/v1/metering/normalized/usage');
        expect(omit(reqs[0][1].body,
          'id', 'processed', 'processed_id', 'collected_usage_id'))
          .to.deep.equal(extend({}, usage, {
            account_id: 'test-account',
            pricing_country: 'USA',
            resource_type: 'test-resource',
            metering_plan_id: 'test-metering-plan',
            rating_plan_id: 'test-rating-plan',
            pricing_plan_id: 'test-pricing-basic',
            prices: {
              metrics: [
                {
                  name: 'storage',
                  price: 1
                },
                {
                  name: 'thousand_light_api_calls',
                  price: 0.03
                },
                {
                  name: 'heavy_api_calls',
                  price: 0.15
                },
                {
                  name: 'memory',
                  price: 0.00014
                }
              ]
            }
          }));

        cb(undefined, [[undefined, {
          statusCode: 201
        }]]);

        check();
      };

      validatorspy = spy((req, res, next) => next());
      authorizespy = spy(function() {});

      // Post usage for a resource, expecting a 201 response
      request.post('http://localhost::p/v1/metering/collected/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator and authorize spy
        expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
        expect(authorizespy.args[0][0]).to.equal(undefined);
        expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
          resource: ['abacus.usage.test-resource.write'],
          system: ['abacus.usage.write']
        } : undefined);

        // Get usage, expecting what we posted
        brequest.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id', 'processed', 'processed_id'))
          .to.deep.equal(usage);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 3 : 0);
          expect(authorizespy.args[1][0]).to.equal(undefined);
          expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
            resource: ['abacus.usage.test-resource.read'],
            system: ['abacus.usage.read']
          } : undefined);

          check();
        });
      });
    };

    // Verify without and with security
    verify(false, () => verify(true, done));
  });

  it('reports reason of business errors', (done) => {
    const usage = {
      start: 1420243200000,
      end: 1420245000000,
      organization_id: 'invalidOrg',
      space_id: 'invalidSpace',
      consumer_id: 'invalidConsumer',
      resource_id: 'test-resource',
      plan_id: 'invalidPlan',
      resource_instance_id: 'invalidResourceInstance',
      measured_usage: [{
        measure: 'light_api_calls',
        quantity: 12
      }]
    };

    // Create a test collector app
    const app = collector();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 4) done();
    };

    getspy = (reqs, cb) => {
      // Expect a call to the provisioning service's validate
      // Returns 200 so we can get into failure management
      if(reqs[0][0] === 
        'http://localhost:9880/v1/provisioning/organizations/' +
        ':organization_id/spaces/:space_id/consumers/:consumer_id/' +
        'resources/:resource_id/plans/:plan_id/instances/' +
        ':resource_instance_id/:time') {
        expect(omit(reqs[0][1],
          'id', 'processed', 'processed_id')).to.deep.equal(
          extend({}, usage, {
            time: usage.end
          }));
        cb(undefined, [[undefined, {
          statusCode: 200
        }]]);
        check();
      }
      // Expect a call to the provisioning service's get resource type
      if(reqs[0][0] === 'http://localhost:9880/v1/provisioning/' +
        'resources/:resource_id/type') {
        expect(reqs[0][1]).to.deep.equal({
          resource_id: usage.resource_id,
          cache: true
        });
        // The second call to account is cached
        expect(reqs[1][0]).to.equal('http://localhost:9881/v1/' +
          'organizations/:org_id/account/:time');
        expect(reqs[1][1]).to.deep.equal(extend({}, {
          org_id: usage.organization_id,
          time: usage.end
        }));
        cb(undefined, [[undefined, {
          statusCode: 200,
          body: 'test-resource'
        }], [undefined, {
          statusCode: 404
        }]]);
        check();
      }
    };

    postspy = (reqs, cb) => {
      // Expect usage to be posted to the meter service
      expect(reqs[0][0]).to.equal(
        'http://localhost:9100/v1/metering/normalized/usage');
      // Error due to no account info and no pricing country.
      expect(omit(reqs[0][1].body,
        'id', 'processed', 'processed_id', 'collected_usage_id'))
        .to.deep.equal(extend({}, usage, {
          error: true,
          reason: [
            'Collector - Unable to retrieve account info',
            'Pricing config - Undefined pricing plan id / country'
          ]
        }));
      cb(undefined, [[undefined, {
        statusCode: 201
      }]]);
      check();
    };

    // Post usage for a resource, expecting a 201 response
    request.post('http://localhost::p/v1/metering/collected/usage', {
      p: server.address().port,
      body: usage
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);

      // Get usage, expecting what we posted
      brequest.get(val.headers.location, {}, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(omit(val.body, 'id', 'processed', 'processed_id'))
        .to.deep.equal(usage);

        check();
      });
    });
  });

  it('calls account plugin to get account information', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 1) done();
    };

    const sampleAccount = {
      account_id: '1234',
      organizations: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'],
      pricing_country: 'USA'
    };
    getspy = (reqs, cb) => {
      expect(reqs[cbs][0]).to.equal(
        'http://localhost:9881/v1/organizations/:org_id/account/:time');
      expect(reqs[cbs][1]).to.deep.equal({
        org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        time: 1420070400000
      })
      cb(undefined, [[null, { statusCode: 200, body: sampleAccount }]])
    }

    const getAccount = yieldable.functioncb(collector.account);
    
    // Retrieve account information
    getAccount('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal({
          error: undefined,
          body: {
            account_id: '1234',
            pricing_country: 'USA'
          },
          reason: undefined
        });
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    getAccount('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal({
          error: undefined,
          body: {
            account_id: '1234',
            pricing_country: 'USA'
          },
          reason: undefined
        });
        cb();
      });
  });

  it('responses with the appropriate account error flag and reason', (done) => {
    getspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal(
        'http://localhost:9881/v1/organizations/:org_id/account/:time');
      expect(reqs[0][1]).to.deep.equal({
        org_id: 'invalidOrg',
        time: 1420070400000
      })
      cb(undefined, [[null, { statusCode: 404, body: 'Not found' }]])
    }

    const getAccount = yieldable.functioncb(collector.account);
    
    // Retrieve account information
    getAccount('invalidOrg', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal({
          error: true,
          body: undefined,
          reason: 'Collector - Unable to retrieve account info'
        });
        done();
      });
  });

  it('calls provision plugin to get resource type', (done) => {
    getspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal(
        'http://localhost:9880/v1/provisioning/resources/:resource_id/type');
      expect(reqs[0][1]).to.deep.equal({
        cache: true,
        resource_id: 'test-resourceId'
      })
      cb(undefined, [[null, { statusCode: 200, body: 'test-resourceType' }]])
    }

    const getResType = yieldable.functioncb(collector.resourceType);
    
    // Retrieve account information
    getResType('test-resourceId', undefined,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal({
          error: undefined,
          body: 'test-resourceType',
          reason: undefined
        });
        done();
      });
  });

  it('responses with resource type error flag and reason', (done) => {
    getspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal(
        'http://localhost:9880/v1/provisioning/resources/:resource_id/type');
      expect(reqs[0][1]).to.deep.equal({
        cache: true,
        resource_id: 'invalidId'
      })
      cb(undefined, [[null, { statusCode: 404, body: 'Not found' }]])
    }

    const getResType = yieldable.functioncb(collector.resourceType);
    
    // Retrieve account information
    getResType('invalidId', undefined,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal({
          error: true,
          body: undefined,
          reason: 'Collector - Unable to retrieve resource type'
        });
        done();
      });
  });
});
