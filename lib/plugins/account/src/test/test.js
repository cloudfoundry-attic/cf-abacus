'use strict';

// Plugin for an account management service.

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

describe('abacus-account-plugin', () => {
  it('returns information about an account', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create an account management plugin application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get an account, expecting our plugin test account
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

    // Create an account management plugin application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get the account containing an org, expecting our plugin test account
    const account = {
      account_id: '1234',
      organizations: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'],
      pricing_country: 'USA'
    };
    request.get('http://localhost::p/v1/organizations/:org_id/account/:time', {
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

  it('returns a rating plan & rating plan id', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create a test account management plugin app
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
      '/:rating_plan_id', {
        p: server.address().port,
        rating_plan_id: 'object-rating-plan'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../plans/rating/object-rating-plan'));

        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(0);

        done1();
      });

    request.get(
      'http://localhost::p/v1/rating/organizations/:organization_id' +
      '/resource_types/:resource_type/plans/:plan_id/' +
      'time/:time/rating_plan/id', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('object-rating-plan');
        done1();
      });
  });

  it('returns a pricing plan & pricing plan id', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create a test account management plugin app
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
      'http://localhost::p/v1/pricing/plans' +
      '/:pricing_plan_id', {
        p: server.address().port,
        pricing_plan_id: 'object-pricing-basic'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../plans/pricing/object-pricing-basic'));

        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(0);

        done1();
      });

    request.get(
      'http://localhost::p/v1/pricing/organizations/:organization_id' +
      '/resource_types/:resource_type/plans/:plan_id' +
      '/time/:time/pricing_plan/id', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('object-pricing-basic');
        done1();
      });
  });

  it('runs a secured account management plugin', (done) => {
    process.env.SECURED = 'true';
    oauthspy.reset();

    // Create an account management plugin application
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

    // Get an account, expecting our plugin test account
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

    // Get the account containing an org, expecting our plugin test account
    brequest.get('http://localhost::p/v1/organizations/:org_id/account/:time', {
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

    // Get pricing plan id
    brequest.get(
      'http://localhost::p/v1/pricing/organizations/:organization_id/' +
      'resource_types/:resource_type/plans/:plan_id/' +
      'time/:time/pricing_plan/id', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('object-pricing-basic');
        done1();
      });

    // Get rating plan id for the given org, resource type, and plan id
    brequest.get(
      'http://localhost::p/v1/rating/organizations/:organization_id' +
      '/resource_types/:resource_type/plans/:plan_id/' +
      'time/:time/rating_plan/id', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('object-rating-plan');
        done1();
      });

    // Get rating plan with the given id
    brequest.get(
      'http://localhost::p/v1/rating/plans/:rating_plan_id', {
        p: server.address().port,
        rating_plan_id: 'object-rating-plan'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          '../plans/rating/object-rating-plan'));
        done1();
      });

    // Get pricing plan with the given the id
    brequest.get(
      'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
        p: server.address().port,
        pricing_plan_id: 'object-pricing-basic'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(require(
          '../plans/pricing/object-pricing-basic'));
        done1();
      });
  });

  it('validates sample rating plans', () => {
    map(['analytics-rating-plan', 'basic-test-rating-plan',
      'linux-rating-plan', 'object-rating-plan', 'standard-test-rating-plan'],
      (name) => {
        console.log('    validating', name, ' rating');
        const rp = require('../plans/rating/' + name);
        expect(schemas.ratingPlan.validate(rp)).to.deep.equal(rp);
        console.log('        validated', name, ' rating');
      });
  });

  it('validates sample pricing plans', () => {
    map(['linux-pricing-basic', 'linux-pricing-standard',
      'object-pricing-basic', 'object-pricing-standard',
      'test-pricing-basic', 'test-pricing-standard'],
      (name) => {
        console.log('    validating', name, ' pricing');
        const pp = require('../plans/pricing/' + name);
        expect(schemas.pricingPlan.validate(pp)).to.deep.equal(pp);
        console.log('        validated', name, ' pricing');
      });
  });

  it('validates creation of new rating plans', (done) => {
    // Create a test provisioning app
    const app = accountManagement();

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
      if (expected === 0)
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
          expect(val.body).to.deep.equal(rating);
          checkDone();
        });
    }

    const validGetRequest = function(rating) {
      request.get(
        'http://localhost::p/v1/rating/plans/:rating_plan_id', {
          p: server.address().port,
          rating_plan_id: rating.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(rating);
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
    const app = accountManagement();

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
      if (expected === 0)
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
          expect(val.body).to.deep.equal(pricing);
          checkDone();
        });
    }

    const validGetRequest = function(pricing) {
      request.get(
        'http://localhost::p/v1/pricing/plans/:pricing_plan_id', {
          p: server.address().port,
          pricing_plan_id: pricing.plan_id
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(pricing);
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
