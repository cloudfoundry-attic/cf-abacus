'use strict';

// Stub for an account management service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const provisioning = require('..');

describe('abacus-account-stub', () => {
  it('returns information about an account', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get an account, expecting our stub test account
    const account = {
      account_id: '1234',
      organizations: [
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
      pricing_country: 'USA'
    };
    request.get('http://localhost::p/v1/accounts/:account_id', {
      p: server.address().port,
      account_id: '1234'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal(account);
      done();
    });
  });

  it('returns information about the account containing an org', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get the account containing an org, expecting our stub test account
    const account = {
      account_id: '1234',
      organizations: [
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
      pricing_country: 'USA'
    };
    request.get('http://localhost::p/v1/orgs/:org_id/account', {
      p: server.address().port,
      org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal(account);
      done();
    });
  });
});

