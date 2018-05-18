'use strict';

// Plugin for an account management service.
const { extend } = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const oauth = require('abacus-oauth');
const cluster = require('abacus-cluster');

process.env.DB = process.env.DB || 'test';
const dbclient = require('abacus-dbclient');
const mappings = require('abacus-plan-mappings');

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

describe('abacus-account-plugin', () => {
  let accountManagement;
  let server;

  beforeEach((done) => {
    process.env.DB = process.env.DB || 'test';
    delete process.env.ACCOUNT_BACKEND;
    oauthspy.reset();

    dbclient.drop(process.env.DB,
      /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/, () => {
        mappings.storeDefaultMappings(done);
      });
  });

  context('with unsecured environment', () => {
    beforeEach(() => {
      process.env.SECURED = 'false';

      // Listen on an ephemeral port
      accountManagement = require('..');
      server = accountManagement(0);
    });

    it('returns information about an account', (done) => {
      process.env.SECURED = 'false';
      oauthspy.reset();

      // Get an account, expecting our plugin test account
      const account = {
        account_id: '5678',
        organizations: [ 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27' ],
        pricing_country: 'USA',
        license_type: 'TRIAL'
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
      // Get the account containing an org, expecting our plugin test account
      const account = {
        account_id: '1234',
        organizations: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'],
        pricing_country: 'USA',
        license_type: 'TRIAL'
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
  });

  context('with secured environment', () => {
    beforeEach(() => {
      process.env.SECURED = 'true';

      // Listen on an ephemeral port
      server = accountManagement(0);
    });

    it('runs a secured account management plugin', (done) => {
      let cbs = 0;
      const verify = () => {
        if(++cbs === 2) {
          // Check oauth validator spy
          expect(oauthspy.callCount).to.equal(3);
          done();
        }
      };

      // Get an account, expecting our plugin test account
      const account = {
        account_id: '5678',
        organizations: [ 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27' ],
        pricing_country: 'USA',
        license_type: 'TRIAL'
      };
      brequest.get('http://localhost::p/v1/accounts/:account_id', {
        p: server.address().port,
        account_id: '5678'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(account);
        verify();
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
            pricing_country: 'USA',
            license_type: 'TRIAL'
          });
          verify();
        });
    });

    it('retrieves metering, rating and pricing plan ids', (done) => {
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
});
