'use strict';

// Stub for an account management service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const schemas = require('abacus-usage-schemas');

const extend = _.extend;
const map = _.map;

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

const brequest = batch(request);

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const accountManagement = require('..');

describe('abacus-account-stub', () => {
  it('returns information about an account', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create an account management stub application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get an account, expecting our stub test account
    const account = {
      account_id: '5678',
      organizations: [
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
      pricing_country: 'USA'
    };
    request.get('http://localhost::p/v1/accounts/:account_id', {
      p: server.address().port,
      account_id: '5678'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal(account);

      // Check oauth validator spy
      expect(oauthspy.callCount).to.equal(0);

      done();
    });
  });

  it('returns information about the account containing an org', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create an account management stub application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get the account containing an org, expecting our stub test account
    const account = {
      account_id: '1234',
      organizations: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'],
      pricing_country: 'USA'
    };
    request.get('http://localhost::p/v1/orgs/:org_id/account/:time', {
      p: server.address().port,
      org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      time: 1420070400000
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal(account);

      // Check oauth validator spy
      expect(oauthspy.callCount).to.equal(0);

      done();
    });
  });

  it('returns a resource price config', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create a test account management stub app
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    request.get(
      'http://localhost::p/v1/pricing/resources' +
      '/:resource_id/config/:time', {
        p: server.address().port,
        resource_id: 'object-storage',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../resources/object-storage'));

        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(0);

        done();
      });
  });

  it('returns a rating config', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create a test account management stub app
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 2) {
        expect(oauthspy.callCount).to.equal(0);
        done();
      }
    }

    request.get(
      'http://localhost::p/v1/rating/plans' +
      '/:rating_plan_id/config/', {
        p: server.address().port,
        rating_plan_id: 'object-rating-plan'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../rating-configs/object-rating-plan'));

        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(0);

        done1();
      });

    request.get(
      'http://localhost::p/v1/rating/orgs/:organization_id/resources/' +
      ':resource_id/types/:resource_type/plans/:plan_id/:time', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_id: 'object-storage',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          '../rating-configs/object-rating-plan'));
        done1();
      });
  });

  it('Run a secured account management stub', (done) => {
    process.env.SECURED = 'true';
    oauthspy.reset();

    // Create an account management stub application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 6) {
        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(7);
        done();
      }
    }

    // Get an account, expecting our stub test account
    const account = {
      account_id: '5678',
      organizations: [
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
      pricing_country: 'USA'
    };
    brequest.get('http://localhost::p/v1/accounts/:account_id', {
      p: server.address().port,
      account_id: '5678'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal(account);
      done1();
    });

    // Get the account containing an org, expecting our stub test account
    brequest.get('http://localhost::p/v1/orgs/:org_id/account/:time', {
      p: server.address().port,
      org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      time: 1420070400000
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal({
        account_id: '1234',
        organizations: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'],
        pricing_country: 'USA'
      });
      done1();
    });

    // Get Pricing config for a resource
    brequest.get(
      'http://localhost::p/v1/pricing/resources' +
      '/:resource_id/config/:time', {
        p: server.address().port,
        resource_id: 'object-storage',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../resources/object-storage'));
        done1();
      });

    // Get pricing information
    brequest.get(
      'http://localhost::p/v1/pricing/orgs/:organization_id/resources/' +
      ':resource_id/types/:resource_type/plans/:plan_id/:time', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_id: 'object-storage',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal({
          pricing_plan_id: 'object-pricing-basic',
          prices: [{
            name: 'storage',
            price: 1.00
          }, {
            name: 'thousand_light_api_calls',
            price: 0.03
          }, {
            name: 'heavy_api_calls',
            price: 0.15
          }]
        });
        done1();
      });

    // Get rating configuration
    brequest.get(
      'http://localhost::p/v1/rating/orgs/:organization_id/resources/' +
      ':resource_id/types/:resource_type/plans/:plan_id/:time', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_id: 'object-storage',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          '../rating-configs/object-rating-plan'));
        done1();
      });

    // Get rating configuration using rating_plan_id
    brequest.get(
      'http://localhost::p/v1/rating/plans/:rating_plan_id/config', {
        p: server.address().port,
        rating_plan_id: 'object-rating-plan'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          '../rating-configs/object-rating-plan'));
        done1();
      });
  });

  it('validates sample price configurations', () => {
    map(['object-storage', 'linux-container'], (name) => {
      console.log('    validating', name, ' pricing');
      const conf = require('../resources/' + name);
      expect(schemas.priceConfig.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, ' pricing');
    });
  });

  it('validates sample rating configurations', () => {
    map(['analytics-rating-plan', 'basic-test-rating-plan',
      'linux-rating-plan', 'object-rating-plan', 'standard-test-rating-plan'],
      (name) => {
        console.log('    validating', name, ' rating');
        const conf = require('../rating-configs/' + name);
        expect(schemas.ratingConfig.validate(conf)).to.deep.equal(conf);
        console.log('        validated', name, ' rating');
      });
  });

  it('validates creation of new rating configurations', (done) => {
    // Create a test provisioning app
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Validate a valid provisioned test resource config
    const ratingConfig = {
      rating_plan_id: 'test',
      effective: 1420070400000,
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
      if (expected === 0)
        done();
    };

    const getFromCache = function(ratingConfig) {
      request.get(
        'http://localhost::p/v1/rating/plans/:rating_plan_id/config', {
          p: server.address().port,
          rating_plan_id: ratingConfig.rating_plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(ratingConfig);
          checkDone();
        });
    }

    const validGetRequest = function(ratingConfig) {
      request.get(
        'http://localhost::p/v1/rating/plans/:rating_plan_id/config', {
          p: server.address().port,
          rating_plan_id: ratingConfig.rating_plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(ratingConfig);
          checkDone();
          getFromCache(ratingConfig);
        });
    };

    const postRequest = function(ratingConfig) {
      request.post(
        'http://localhost::p/v1/rating/plans/:rating_plan_id/config', {
          p: server.address().port,
          rating_plan_id: ratingConfig.rating_plan_id,
          body: ratingConfig
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(204);
          checkDone();
          validGetRequest(ratingConfig);
        });
    };
    postRequest(ratingConfig);
    request.post(
      'http://localhost::p/v1/rating/plans/:rating_plan_id/config', {
        p: server.address().port,
        rating_plan_id: 'test',
        body: {}
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(400);
        checkDone();
      });
  });
});
