'use strict';

// Minimal example implementation of an Abacus provisioning plugin.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const schemas = require('abacus-usage-schemas');
const dbclient = require('abacus-dbclient');

const extend = _.extend;
const map = _.map;
const omit = _.omit;

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const provisioning = require('..');

describe('abacus-provisioning-plugin', () => {
  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB,
      /^abacus-rating-plans|^abacus-pricing-plans|^abacus-metering-plans/,
      done);
  });


  it('returns resource instance info by ' +
    'org/space/app/resource/plan/instance', (done) => {
    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();

      // Create a test provisioning app
      const app = provisioning();

      // Listen on an ephemeral port
      const server = app.listen(0);

      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) {
          // Check oauth validator spy
          expect(oauthspy.callCount).to.equal(secured ? 2 : 0);

          done();
        }
      };

      // Validate a valid provisioned resource instance
      const valid = {
        org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'object-storage',
        plan_id: 'basic',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        time: 1420070400000
      };

      request.get(
        'http://localhost::p/v1/provisioning/organizations/:org_id/' +
        'spaces/:space_id/consumers/:consumer_id/resources/:resource_id/' +
        'plans/:plan_id/instances/:resource_instance_id/:time', extend({
          p: server.address().port
        }, valid), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(valid);
          cb();
        });

      // Reject an invalid provisioned resource instance, this one uses
      // invalid resource and plan ids
      const invalid = {
        org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'invalid-resource',
        plan_id: 'invalid-plan',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        time: 1420070400000
      };

      request.get(
        'http://localhost::p/v1/provisioning/organizations/:org_id/' +
        'spaces/:space_id/consumers/:consumer_id/resources/:resource_id/' +
        'plans/:plan_id/instances/:resource_instance_id/:time', extend({
          p: server.address().port
        }, invalid), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(404);
          cb();
        });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  it('returns available metering, rating and pricing plans', (done) => {
    oauthspy.reset();
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 3) {
        expect(oauthspy.callCount).to.equal(3);
        done();
      }
    };

    // Get metering plan with the given id
    request.get(
      'http://localhost::p/v1/metering/plans' +
      '/:metering_plan_id', {
        p: server.address().port,
        metering_plan_id: 'basic-object-storage'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../plans/metering/basic-object-storage'));
        done1();
      });

    // Get rating plan with the given id
    request.get(
      'http://localhost::p/v1/rating/plans/:rating_plan_id', {
        p: server.address().port,
        rating_plan_id: 'object-rating-plan'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(omit(val.body, 'id')).to.deep.equal(require(
          '../plans/rating/object-rating-plan'));
        done1();
      });

    // Get pricing plan with the given the id
    request.get(
      'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
        p: server.address().port,
        pricing_plan_id: 'object-pricing-basic'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(omit(val.body, 'id')).to.deep.equal(require(
          '../plans/pricing/object-pricing-basic'));
        done1();
      });

  });

  it('returns the type of a resource', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    request.get(
      'http://localhost::p/v1/provisioning/resources' +
      '/:resource_id/type', {
        p: server.address().port,
        resource_id: 'object-storage'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('object-storage');
        done();
      });
  });

  it('validates all test metering plans', () => {
    map([
      'basic-analytics',
      'basic-object-storage',
      'standard-object-storage',
      'basic-linux-container',
      'standard-linux-container',
      'test-metering-plan'
    ], (name) => {
      console.log('    validating', name, ' metering plan');
      const conf = require('../plans/metering/' + name);
      expect(schemas.meteringPlan.validate(conf)).to.deep.equal(
        conf);
      console.log('        validated', name, ' metering plan');
    });
  });

  it('validates creation of new metering plans', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Validate a valid test metering plan
    const mplan = {
      plan_id: 'test',
      measures: [
        {
          name: 'classifiers',
          unit: 'INSTANCE'
        }
      ],
      metrics: [
        {
          name: 'classifier_instances',
          unit: 'INSTANCE',
          type: 'discrete',
          formula: 'AVG({classifier})'
        }
      ]
    };

    let expected = 4;
    const checkDone = () => {
      expected--;
      if(expected === 0)
        done();
    };

    const validGetRequest = function(mplan) {
      request.get(
        'http://localhost::p/v1/metering/plans/:metering_plan_id', {
          p: server.address().port,
          metering_plan_id: mplan.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(mplan);
          checkDone();
        });
    };

    const getFromCache = function(mplan) {
      request.get(
        'http://localhost::p/v1/metering/plans/:metering_plan_id', {
          p: server.address().port,
          metering_plan_id: mplan.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(mplan);
          checkDone();
        });
    };

    const postRequest = function(mplan) {
      request.post(
        'http://localhost::p/v1/metering/plans/:metering_plan_id', {
          p: server.address().port,
          metering_plan_id: mplan.plan_id,
          body: mplan
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          checkDone();
          validGetRequest(mplan);
          getFromCache(mplan);
        });
    };
    postRequest(mplan);
    request.post(
      'http://localhost::p/v1/metering/plans/:metering_plan_id', {
        p: server.address().port,
        metering_plan_id: 'test',
        body: {}
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(400);
        checkDone();
      });
  });

  it('validates creation of new rating plans', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Validate a valid test rating plan
    const rating = {
      plan_id: 'test',
      metrics: [
        {
          name: 'classifier',
          rate: ((price, qty) => new BigNumber(price || 0)
            .mul(qty).toNumber()).toString()
        }
      ]
    };

    let expected = 4;
    const checkDone = () => {
      expected--;
      if(expected === 0)
        done();
    };

    const getFromCache = function(rating) {
      request.get(
        'http://localhost::p/v1/rating/plans/:rating_plan_id', {
          p: server.address().port,
          rating_plan_id: rating.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(rating);
          checkDone();
        });
    };

    const validGetRequest = function(rating) {
      request.get(
        'http://localhost::p/v1/rating/plans/:rating_plan_id', {
          p: server.address().port,
          rating_plan_id: rating.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(rating);
          checkDone();
          getFromCache(rating);
        });
    };

    const postRequest = function(rating) {
      request.post(
        'http://localhost::p/v1/rating/plans/:rating_plan_id', {
          p: server.address().port,
          rating_plan_id: rating.plan_id,
          body: rating
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          checkDone();
          validGetRequest(rating);
        });
    };
    postRequest(rating);
    request.post(
      'http://localhost::p/v1/rating/plans/:rating_plan_id', {
        p: server.address().port,
        rating_plan_id: rating.plan_id,
        body: {}
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(400);
        checkDone();
      });
  });

  it('validates creation of new pricing plans', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Validate a valid test pricing plan
    const pricing = {
      plan_id: 'test-db-basic',
      metrics: [
        {
          name: 'classifier',
          prices: [
            {
              country: 'USA',
              price: 0.00015
            },
            {
              country: 'EUR',
              price: 0.00011
            },
            {
              country: 'CAN',
              price: 0.00016
            }]
        }
      ]
    };

    let expected = 4;
    const checkDone = () => {
      expected--;
      if(expected === 0)
        done();
    };

    const getFromCache = function(pricing) {
      request.get(
        'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
          p: server.address().port,
          pricing_plan_id: pricing.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(pricing);
          checkDone();
        });
    };

    const validGetRequest = function(pricing) {
      request.get(
        'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
          p: server.address().port,
          pricing_plan_id: pricing.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(pricing);
          checkDone();
          getFromCache(pricing);
        });
    };

    const postRequest = function(pricing) {
      request.post(
        'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
          p: server.address().port,
          pricing_plan_id: pricing.plan_id,
          body: pricing
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          checkDone();
          validGetRequest(pricing);
        });
    };
    postRequest(pricing);
    request.post(
      'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
        p: server.address().port,
        pricing_plan_id: pricing.plan_id,
        body: {}
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(400);
        checkDone();
      });
  });

});
