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
    request.get('http://localhost::p/v1/orgs/:org_id/account', {
      p: server.address().port,
      org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'
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

  it('Run a secured account management stub', (done) => {
    process.env.SECURED = 'true';
    oauthspy.reset();

    // Create an account management stub application
    const app = accountManagement();

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 3) {
        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(4);
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
    brequest.get('http://localhost::p/v1/orgs/:org_id/account', {
      p: server.address().port,
      org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'
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
  });

  it('validates sample price configurations', () => {
    map(['object-storage', 'linux-container'], (name) => {
      console.log('    validating', name, ' pricing');
      const conf = require('../resources/' + name);
      expect(schemas.priceConfig.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, ' pricing');
    });
  });
});
