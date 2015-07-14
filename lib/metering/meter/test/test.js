'use strict';

// Usage metering service.

const _ = require('underscore');
const extend = _.extend;
const omit = _.omit;

const proxyquire = require('proxyquire');
const request = require('cf-abacus-request');

// Configure test db URL prefix and splitter service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.ACCUMULATOR = 'http://localhost::port';

// Mock the cluster and request modules
const clustmock = (app) => app;
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': clustmock });
const reqmock = { norespost: spy((uri, req, cb) => cb()) };

const meterapp = proxyquire('..', { 'cf-abacus-webapp': webapp, 'cf-abacus-request': reqmock });

describe('cf-abacus-usage-meter', () => {
    describe('validate usage consumption formulas', () => {
        it('validate a formula with a unit', () => {
            expect(meterapp.dslformula('SUM({LIGHT_API_CALL})')).to.equal('r.LIGHT_API_CALL');
        });
        it('validate a formula with a unit and a divisision', () => {
            expect(meterapp.dslformula('MAX({BYTE}/1073741824)')).to.equal('r.BYTE / 1073741824');
        });
        it('validate a formula with a unit and a multiplication', () => {
            expect(meterapp.dslformula('MAX({BYTE}*1073741824)')).to.equal('r.BYTE * 1073741824');
        });
        it('validate a formula with multiple units and a multiplication', () => {
            expect(meterapp.dslformula('SUM({GIGABYTE}*{INSTANCE}*{HOUR})')).to.equal('r.GIGABYTE * r.INSTANCE * r.HOUR');
        });
        it('validate a formula with multiple resource units and a multiplication', () => {
            expect(meterapp.dslformula('SUM({Memory.GIGABYTE}*{Memory.INSTANCE}*{Memory.HOUR})')).to.equal('r.Memory.GIGABYTE * r.Memory.INSTANCE * r.Memory.HOUR');
        });
    });

    describe('convert resources to a javascript object', () => {
        it('validate resources without resource name', () => {
            expect(meterapp.resources({resources: [{unit: 'BYTE', quantity: 1}, {unit: 'LIGHT_API_CALL', quantity: 2}, {unit: 'HEAVY_API_CALL', quantity: 3}]}))
                .to.deep.equal({ BYTE: 1, 'LIGHT_API_CALL': 2, 'HEAVY_API_CALL': 3});
        });
        it('validate resources with resource name', () => {
            expect(meterapp.resources({resources: [{name: 'Memory', unit: 'GIGABYTE', quantity: 1}, {name: 'Memory', unit: 'HOUR', quantity: 2},
                {name: 'Storage', unit: 'GIGABYTE', quantity: 3}]})).to.deep.equal({Memory: {GIGABYTE: 1, HOUR: 2 }, Storage: { GIGABYTE: 3}});
        });
    });

    describe('validate usage metering', () => {
        it('meter a usage', () => {
            expect(meterapp.meter({service_id: 'storage', resources: [{unit: 'BYTE', quantity: 1073741824}, {unit: 'LIGHT_API_CALL', quantity: 2000},
                {unit: 'HEAVY_API_CALL', quantity: 3}]})).to.deep.equal({service_id: 'storage', resources: [{unit: 'BYTE', quantity: 1073741824}, {unit: 'LIGHT_API_CALL', quantity: 2000},
                {unit: 'HEAVY_API_CALL', quantity: 3}], metered_usage: [ {unit: 'STORAGE_PER_MONTH', quantity: 1}, {unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 2},
                {unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 3}]});
        });
    });

    describe('validate meter app', () => {
        it('meter a usage record', function(done) {
            this.timeout(60000);

            // Create a test meter app
            const app = meterapp();

            // Listen on an ephemeral port
            const server = app.listen(0);

            // Post usage for a service, expecting the api to meter the usage, store it at the database and retun  201 as response with location URL as a body
            const usage = { id: '777', usage_batch_id: '555', service_id: 'storage', service_instance_id: '123',
                start: 1420243200000, end: 1420245000000, plan_id: 'plan_123', region: 'us',
                organization_guid: 'org_456', space_guid: 'space_567', consumer: { type: 'external', value: '123' },
                resources: [{ unit: 'BYTE', quantity: 1073741824}, { unit: 'LIGHT_API_CALL', quantity:10}, { unit: 'HEAVY_API_CALL', quantity: 20 }]};

            request.post('http://localhost::p/v1/metering/usage', { p: server.address().port, body: usage }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);

                // Get metered usage, expecting what we posted
                request.get(val.headers.location, {}, (err, val) => {
                    expect(err).to.equal(undefined);
                    expect(val.statusCode).to.equal(200);

                    expect(omit(val.body, 'id')).to.deep.equal(extend(omit(usage, 'id'), { usage_id: '777', metered_usage:[{unit: 'STORAGE_PER_MONTH', quantity: 1},
                        { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 0.010 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 20 }]}));

                    // Expect usage to be posted to the accumulator service too
                    expect(reqmock.norespost.args.length).to.equal(1);
                    expect(reqmock.norespost.args[0][0]).to.equal('http://localhost:9102/v1/metering/metered/usage');
                    done();
                });
            });
        });
    });
});

