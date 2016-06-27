'use strict';

// Usage metering service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');

const extend = _.extend;
const omit = _.omit;

// Configure test db URL prefix and splitter service URL
process.env.DB = process.env.DB || 'test';
process.env.ACCUMULATOR = 'http://localhost:9200';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
let postspy, getspy;
const reqmock = extend({}, request, {
  batch_post: (reqs, cb) => postspy(reqs, cb),
  batch_get: (reqs, cb) => getspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
let validatorspy, authorizespy, cachespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope),
  cache: () => cachespy()
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const meterapp = require('..');

describe('abacus-usage-meter', () => {
  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-meter-/, done);
  });

  it('meters usage docs', (done) => {

    const verify = (secured, done) => {
      // Post usage for a resource, expecting the api to meter the usage,
      // store it in the database and return 201 as response with location
      // URL as a body
      const usage = {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: ['0b39fa70-a65f-4183-bae8-385633ca5c87',
          secured ? 1 : 0].join('-'),
        start: 1420243200000,
        end: 1420245000000,
        plan_id: 'basic',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_type: 'test-resource',
        account_id: '1234',
        pricing_country: 'USA',
        metering_plan_id: 'test-metering-plan',
        rating_plan_id: 'test-rating-plan',
        pricing_plan_id: 'test-pricing-basic',
        prices: {
          metrics: [
            { name: 'storage',
              price: 1 },
            { name: 'thousand_light_api_calls',
              price: 0.03 },
            { name: 'heavy_api_calls',
              price: 0.15 },
            { name: 'memory',
              price: 0.00014 }
          ]
        },
        measured_usage: [{
          measure: 'storage',
          quantity: 1073741824
        }, {
          measure: 'light_api_calls',
          quantity: 10
        }, {
          measure: 'heavy_api_calls',
          quantity: 20
        }, {
          measure: 'current_instance_memory',
          quantity: 3221225472
        }, {
          measure: 'current_running_instances',
          quantity: 2
        }, {
          measure: 'previous_instance_memory',
          quantity: 0
        }, {
          measure: 'previous_running_instances',
          quantity: 0
        }]
      };

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });


      // Create a test meter app
      const app = meterapp();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 2) done();
      };

      postspy = (reqs, cb) => {
        // Expect metered usage to be posted to the accumulator service
        expect(reqs[0][0])
          .to.equal('http://localhost:9200/v1/metering/metered/usage');

        expect(omit(
          reqs[0][1].body, 'id', 'processed',
          'processed_id', 'normalized_usage_id'))
          .to.deep.equal(
            extend(omit(usage, 'id', 'processed', 'processed_id'), {
              metered_usage: [{
                metric: 'storage',
                quantity: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 0.010
              }, {
                metric: 'heavy_api_calls',
                quantity: 20
              }, {
                metric: 'memory',
                quantity: {
                  consuming: 6,
                  previous_consuming: -0
                }
              }]
            }));

        cb(undefined, [[undefined, {
          statusCode: 201
        }]]);

        check();
      };

      validatorspy = spy((req, res, next) => next());
      authorizespy = spy(function() {});

      // Post normalized usage to the meter service
      request.post('http://localhost::p/v1/metering/normalized/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator and authorize spy
        expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
        expect(authorizespy.args[0][0]).to.equal(undefined);
        expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
          system: ['abacus.usage.write']
        } : undefined);

        // Get normalized usage back, expecting what we posted
        request.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 2 : 0);
          expect(authorizespy.args[1][0]).to.equal(undefined);
          expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
            system: ['abacus.usage.read']
          } : undefined);

          expect(omit(val.body, 'id', 'processed', 'processed_id'))
          .to.deep.equal(usage);

          check();
        });
      });
    };

    // Verify without and with security
    verify(false, () => verify(true, done));
  });

  it('receives the error from the accumulator', (done) => {

    const verify = (secured, done) => {
      // Post usage for a resource, expecting the api to meter the usage,
      // store it in the database and return 201 as response with location
      // URL as a body
      const usage = {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: ['0b39fa70-a65f-4183-bae8-385633ca5c87',
          secured ? 1 : 0].join('-'),
        start: 1420243200000,
        end: 1420245000000,
        plan_id: 'basic',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf18',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_type: 'test-resource',
        account_id: '1234',
        pricing_country: 'USA',
        metering_plan_id: 'test-metering-plan',
        rating_plan_id: 'test-rating-plan',
        pricing_plan_id: 'test-pricing-basic',
        prices: {
          metrics: [
            { name: 'storage',
              price: 1 },
            { name: 'thousand_light_api_calls',
              price: 0.03 },
            { name: 'heavy_api_calls',
              price: 0.15 },
            { name: 'memory',
              price: 0.00014 }
          ]
        },
        measured_usage: [{
          measure: 'storage',
          quantity: 1073741824
        }, {
          measure: 'light_api_calls',
          quantity: 10
        }, {
          measure: 'heavy_api_calls',
          quantity: 20
        }, {
          measure: 'current_instance_memory',
          quantity: 3221225472
        }, {
          measure: 'current_running_instances',
          quantity: 2
        }, {
          measure: 'previous_instance_memory',
          quantity: 0
        }, {
          measure: 'previous_running_instances',
          quantity: 0
        }]
      };

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });


      // Create a test meter app
      const app = meterapp();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 2) done();
      };

      postspy = (reqs, cb) => {
        // Expect metered usage to be posted to the accumulator service
        expect(reqs[0][0])
          .to.equal('http://localhost:9200/v1/metering/metered/usage');

        expect(omit(
          reqs[0][1].body, 'id', 'processed',
          'processed_id', 'normalized_usage_id'))
          .to.deep.equal(
            extend(omit(usage, 'id', 'processed', 'processed_id'), {
              metered_usage: [{
                metric: 'storage',
                quantity: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 0.010
              }, {
                metric: 'heavy_api_calls',
                quantity: 20
              }, {
                metric: 'memory',
                quantity: {
                  consuming: 6,
                  previous_consuming: -0
                }
              }]
            }));

        cb(undefined, [[undefined, {
          statusCode: 201,
          body: {
            error: 'erplannotfound',
            reason: 'Rating plan for the rating plan id ' +
              'test-rating-plan is not found'
          }
        }]]);

        check();
      };

      validatorspy = spy((req, res, next) => next());
      authorizespy = spy(function() {});

      // Post normalized usage to the meter service
      request.post('http://localhost::p/v1/metering/normalized/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        expect(val.body).to.deep.equal({
          error: 'esink',
          reason: [{
            error: 'erplannotfound',
            reason: 'Rating plan for the rating plan id ' +
              'test-rating-plan is not found'
          }]
        });

        // Check oauth validator and authorize spy
        expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
        expect(authorizespy.args[0][0]).to.equal(undefined);
        expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
          system: ['abacus.usage.write']
        } : undefined);

        // Get normalized usage back, expecting what we posted
        request.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 2 : 0);
          expect(authorizespy.args[1][0]).to.equal(undefined);
          expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
            system: ['abacus.usage.read']
          } : undefined);

          expect(omit(val.body, 'id', 'processed', 'processed_id'))
          .to.deep.equal(usage);

          check();
        });
      });
    };

    // Verify without and with security
    verify(false, () => verify(true, done));
  });

  it('attaches error and reasons when there is a business error', (done) => {
    process.env.SECURED = false;
    // Create a test meter app
    const app = meterapp();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 2) done();
    };
    const usage = {
      collected_usage_id: '555',
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c875',
      start: 1420243200000,
      end: 1420245000000,
      plan_id: 'basic',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      resource_type: 'test-resource',
      account_id: '1234',
      pricing_country: 'USA',
      metering_plan_id: 'invalidMeteringPlan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic',
      prices: {
        metrics: [
          { name: 'storage',
            price: 1 }
        ]
      },
      measured_usage: [{
        measure: 'storage',
        quantity: 1073741824
      }]
    };

    getspy = (reqs, cb) => {
      // Expect a call to the provisioning service's get metering plan
      expect(reqs[0][0]).to.equal(
        'http://localhost:9880/v1/metering/plans/:metering_plan_id');
      expect(reqs[0][1]).to.deep.equal({
        metering_plan_id: 'invalidMeteringPlan'
      });
      cb(undefined, [[undefined, {
        statusCode: 404
      }]]);
      check();
    };

    postspy = (reqs, cb) => {
      // Expect metered usage to be posted to the accumulator service
      expect(reqs[0][0])
        .to.equal('http://localhost:9200/v1/metering/metered/usage');
      expect(omit(
        reqs[0][1].body, 'id', 'processed',
        'processed_id', 'normalized_usage_id'))
        .to.deep.equal(
          extend(omit(usage, 'id', 'processed', 'processed_id'), {
            error: 'emplannotfound',
            reason: 'Metering plan for the metering plan id' +
              ' invalidMeteringPlan is not found'
          }));

      cb(undefined, [[undefined, {
        statusCode: 201
      }]]);

      check();
    };

    // Post normalized usage to the meter service
    request.post('http://localhost::p/v1/metering/normalized/usage', {
      p: server.address().port,
      body: usage
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
      expect(val.body).to.deep.equal({
        error: 'emplannotfound',
        reason: 'Metering plan for the metering plan id' +
          ' invalidMeteringPlan is not found'
      });

      // Get normalized usage back, expecting what we posted
      request.get(val.headers.location, {}, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        expect(omit(val.body, 'id', 'processed', 'processed_id'))
        .to.deep.equal(usage);

        check();
      });
    });
  });
});

