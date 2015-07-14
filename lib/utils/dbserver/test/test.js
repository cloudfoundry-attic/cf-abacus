'use strict';

// A test CouchDB server app built using Express and PouchDB

const proxyquire = require('proxyquire');
var memdown = require('memdown');
var request = require('cf-abacus-request');

// Mock the cluster module
const clustmock = (app) => app;
clustmock.isWorker = () => true;
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': clustmock });

const dbserver = proxyquire('..', { 'cf-abacus-webapp': webapp, 'cf-abacus-cluster': clustmock });

/* eslint handle-callback-err: 1 */

describe('cf-abacus-dbserver', () => {
    it('provides a local CouchDB compatible db', (done) => {
        // Create a DB server configured to use in-memory DBs
        var app = dbserver({ db: memdown });

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get the list of DBs
        request.get('http://localhost::p/_all_dbs', { p: server.address().port }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.body).to.deep.equal(['_replicator', '_users']);

            // Create a test DB
            request.put('http://localhost::p/:db', { p: server.address().port, db: 'test'}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.body.ok).to.equal(true);

                // Put a doc into the DB
                request.put('http://localhost::p/:db/:id', { p: server.address().port, db: 'test', id: 123, body: { x: 'hey' }}, (err, val) => {
                    expect(err).to.equal(undefined);
                    expect(val.body.ok).to.equal(true);

                    // Get it back
                    request.get('http://localhost::p/:db/:id', { p: server.address().port, db: 'test', id: 123}, (err, val) => {
                        expect(err).to.equal(undefined);
                        expect(val.body.x).to.equal('hey');
                        done();
                    });
                });
            });
        });
    });
});

