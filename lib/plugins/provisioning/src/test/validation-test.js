'use strict';

const { extend, map } = require('underscore');

const path = require('path');
const utils = require('./utils.js');

const request = require('abacus-request');
const oauth = require('abacus-oauth');
const schemas = require('abacus-usage-schemas');
const dbclient = require('abacus-dbclient');

let mappings;

const deleteModules = (cb = () => {}) => {
  delete require.cache[require.resolve('abacus-plan-mappings')];
  delete require.cache[require.resolve('..')];
  delete require.cache[require.resolve('../lib/store-plans.js')];
  delete require.cache[require.resolve('../lib/plan-db.js')];

  cb();
};

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-provisioning-plugin validation', () => {
  let provisioning;

  beforeEach((done) => {
    deleteModules();
    mappings = require('abacus-plan-mappings');
    provisioning = require('..');

    // Delete test dbs (plan and mappings) on the configured db server
    dbclient.drop(
      dbEnv,
      /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/,
      () => {
        const plansStore = require('../lib/store-plans.js');
        plansStore.storeAllDefaultPlans(done);
      });
  });

  afterEach(() => {
    delete process.env.SECURED;
    delete process.env.JWTKEY;
    delete process.env.JWTALGO;
  });

  const verify = (secured, check, done) => {
    if (secured) {
      process.env.SECURED = 'true';
      process.env.JWTKEY = utils.TOKEN_SECRET;
      process.env.JWTALGO = 'HS256';
    } else
      process.env.SECURED = 'false';

    oauthspy.resetHistory();

    const app = provisioning();
    const server = app.listen(0);

    check(server.address().port, secured, done);
  };

  const provisioningPath = path.dirname(require.resolve('abacus-provisioning-plugin'));

  const authHeader = (secured) => secured ? utils.getSystemReadAuthorization() : {};

  it('returns resource instance information', (done) => {
    const check = (port, secured, done) => {
      let cbs = 0;

      const cb = () => {
        if(++cbs === 2) {
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
          p: port
        }, valid, { headers: authHeader(secured) }), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal(undefined);
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
          p: port
        }, invalid, { headers: authHeader(secured) }), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(404);
          expect(val.body.error).to.equal('Mapping not found.');
          cb();
        });

    };

    // Verify using an unsecured server and then verify using a secured server
    mappings.storeDefaultMappings(() => {
      verify(false, check, () => verify(true, check, done));
    });
  });

  it('returns available metering, rating and pricing plans', (done) => {

    const check = (port, secured, done) => {
      let cbs = 0;
      const cb = () => {
        if (++cbs === 3) {
          expect(oauthspy.callCount).to.equal(secured ? 3 : 0);
          done();
        }
      };

      // Get metering plan with the given id
      request.get('http://localhost::p/v1/metering/plans/:metering_plan_id', {
        p: port,
        metering_plan_id: 'basic-object-storage',
        headers: authHeader(secured)
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require(`${provisioningPath}/plans/metering/basic-object-storage`));
        cb();
      });

      // Get rating plan with the given id
      request.get('http://localhost::p/v1/rating/plans/:rating_plan_id', {
        p: port,
        rating_plan_id: 'object-rating-plan',
        headers: authHeader(secured)
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          `${provisioningPath}/plans/rating/object-rating-plan`));
        cb();
      });

      // Get pricing plan with the given the id
      request.get('http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
        p: port,
        pricing_plan_id: 'object-pricing-basic',
        headers: authHeader(secured)
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          `${provisioningPath}/plans/pricing/object-pricing-basic`));
        cb();
      });
    };

    // Verify using an unsecured server and then verify using a secured server
    mappings.storeDefaultMappings(() => {
      verify(false, check, () => verify(true, check, done));
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
      console.log('    validating', name, 'metering plan');
      const conf = require(`${provisioningPath}/plans/metering/` + name);
      expect(schemas.meteringPlan.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, ' metering plan');
    });
  });

  it('validates all test rating plans', () => {
    map([
      'analytics-rating-plan',
      'linux-rating-plan',
      'object-rating-plan',
      'test-rating-plan',
      'test-rating-plan-standard'
    ], (name) => {
      console.log('    validating', name, 'rating plan');
      const conf = require(`${provisioningPath}/plans/rating/` + name);
      expect(schemas.ratingPlan.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, 'rating plan');
    });
  });

  it('validates all test pricing plans', () => {
    map([
      'linux-pricing-basic',
      'linux-pricing-standard',
      'object-pricing-basic',
      'object-pricing-standard',
      'test-pricing-basic',
      'test-pricing-standard'
    ], (name) => {
      console.log('    validating', name, 'pricing plan');
      const conf = require(`${provisioningPath}/plans/pricing/` + name);
      expect(schemas.pricingPlan.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, 'pricing plan');
    });
  });

});
