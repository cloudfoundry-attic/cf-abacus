'use strict';

// A test CouchDB server app built using Express and PouchDB

const _ = require('underscore');
const memdown = require('memdown');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
extend((app) => app, cluster, {
  isWorker: () => true
});

const pouchserver = require('..');

/* eslint handle-callback-err: 1 */

describe('abacus-pouchserver', () => {
  it('provides a local CouchDB compatible db', (done) => {
    // Create a DB server configured to use in-memory DBs
    const app = pouchserver({
      db: memdown
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get the list of DBs
    request.get('http://localhost::p/_all_dbs', {
      p: server.address().port
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.body).to.deep.equal(['_replicator', '_users']);

      // Create a test DB
      request.put('http://localhost::p/:db', {
        p: server.address().port,
        db: 'test'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.body.ok).to.equal(true);

        // Put a doc into the DB
        request.put('http://localhost::p/:db/:id', {
          p: server.address().port,
          db: 'test',
          id: 123,
          body: {
            x: 'hey'
          }
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.body.ok).to.equal(true);

          // Get it back
          request.get('http://localhost::p/:db/:id', {
            p: server.address().port,
            db: 'test',
            id: 123
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.body.x).to.equal('hey');
            done();
          });
        });
      });
    });
  });
});

