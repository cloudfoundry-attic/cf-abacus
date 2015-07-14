'use strict';

// Stub for an account management service.

const proxyquire = require('proxyquire');
const request = require('cf-abacus-request');

// Mock the cluster module
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': (app) => app });

const provisioning = proxyquire('..', { 'cf-abacus-webapp': webapp });

describe('cf-abacus-account-stub', () => {
    it('returns information about an account', (done) => {
        // Create a test provisioning app
        const app = provisioning();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get an account, expecting our stub test account
        const account = { account_id: '1234', organizations: ['org_123', 'org_456', 'org_789'] };
        request.get('http://localhost::p/v1/accounts/:account_id', { p: server.address().port, account_id: '1234' }, (err, val) => {
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
        const account = { account_id: '1234', organizations: ['org_123', 'org_456', 'org_789'] };
        request.get('http://localhost::p/v1/orgs/:org_id/account', { p: server.address().port, org_id: 'org_123' }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(account);
            done();
        });
    });
});

