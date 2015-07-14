'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time.

const _ = require('underscore');
const extend = _.extend;
const proxyquire = require('proxyquire');
const request = require('cf-abacus-request');

// Mock the cluster module
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': (app) => app });

const provisioning = proxyquire('..', { 'cf-abacus-webapp': webapp });

describe('cf-abacus-provisioning-stub', () => {
    it('returns information about provisioned service instances by region/org/space/app/service/plan/instance', (done) => {
        // Create a test provisioning app
        const app = provisioning();

        // Listen on an ephemeral port
        const server = app.listen(0);

        var path = { region: 'us', org_id: '123', space_id: '456', app_id: '789', service_id: '1234', plan_id: 'myplan', service_instance_id: '567' };
        request.get('http://localhost::p/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/:app_id/services/:service_id/plans/:plan_id/instances/:service_instance_id',
            extend({ p: server.address().port }, path), (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
                expect(val.body).to.deep.equal(path);
                done();
            });
    });

    it('returns information about provisioned runtimes by region/org/space/app/runtime/plan', (done) => {
        // Create a test provisioning app
        const app = provisioning();

        // Listen on an ephemeral port
        const server = app.listen(0);

        var path = { region: 'us', org_id: '123', space_id: '456', app_id: '789', runtime_id: '1234', plan_id: 'myplan' };
        request.get('http://localhost::p/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/:app_id/runtimes/:runtime_id/plans/:plan_id',
            extend({ p: server.address().port }, path), (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
                expect(val.body).to.deep.equal(path);
                done();
            });
    });
});

