'use strict';

// Plugin for an account management service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');

const extend = _.extend;

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

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
    request.get(
      'http://localhost::p/v1/organizations/:org_id/account/:time', {
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

  it('returns error code for failing organizations', (done) => {
    process.env.SECURED = 'false';
    oauthspy.reset();

    // Create an account management plugin application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);
    request.get(
      'http://localhost::p/v1/organizations/:org_id/account/:time', {
        p: server.address().port,
        org_id: 'test_status_code_404',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(404);
        request.get(
          'http://localhost::p/v1/organizations/:org_id/account/:time', {
            p: server.address().port,
            org_id: 'test_status_code_502',
            time: 1420070400000
          }, (err, val) => {
            expect(err.statusCode).to.equal(502);
            expect(val).to.equal(undefined);

            // Check oauth validator spy
            expect(oauthspy.callCount).to.equal(0);

            done();
          });
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
      if(++cbs === 2) {
        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(3);
        done();
      }
    };

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
    brequest.get(
      'http://localhost::p/v1/organizations/:org_id/account/:time', {
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
  });

  it('retrieves metering, rating and pricing plan ids', (done) => {
    process.env.SECURED = 'true';
    oauthspy.reset();

    // Create an account management plugin application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 3) {
        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(3);
        done();
      }
    };

    // Get metering plan id for the given org, resource type, and plan id
    brequest.get(
      'http://localhost::p/v1/metering/organizations/:organization_id' +
      '/resource_types/:resource_type/plans/:plan_id/' +
      'time/:time/metering_plan/id', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        resource_type: 'object-storage',
        plan_id: 'basic',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal('basic-object-storage');
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

    // Get pricing plan id for the given org, resource type, and plan id
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

  });


});
