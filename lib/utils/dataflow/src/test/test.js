'use strict';

// Simple and configurable map and reduce dataflow transforms

const _ = require('underscore');
const request = require('abacus-request');
const router = require('abacus-router');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Configure test db URL prefix and sink service URLs
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.SINK = 'http://localhost:9081';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const webapp = require('abacus-webapp');

// Mock the request module
const reqmock = extend({}, request, {
  batch_get: spy((reqs, cb) => cb(undefined, [[undefined, {
    statusCode: 200
  }]])),
  batch_post: spy((reqs, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

const dataflow = require('..');

describe('abacus-dataflow', () => {
  it('stores and retrieves inputs and outputs of map transforms',
    function(done) {
      this.timeout(60000);

      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Pair = {
        validate: (doc) => doc
      };

      // Define a test map transform that computes the sum of a pair of
      // numbers
      const sum = function *(doc) {
        return [{
          val: doc.x + doc.y
        }];
      };

      // Define key and time functions
      const t = 1443650828616;
      const ikey = (doc) => 'foo';
      const itime = (doc) => t;
      const okey = (doc) => 'bar';
      const otime = (doc) => t;

      // Add a dataflow mapper middleware to our test app
      const mapper = dataflow.mapper(
        '/pairs', Pair, 'pair', ikey, itime,
        sum, '/sums', 'sums', okey, otime);
      app.use('/v1', mapper);

      app.use(router.batch(app));

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Post an input doc, expecting a 201 response
      const idoc = {
        x: 1,
        y: 2
      };

      request.post('http://localhost::p/v1/pairs', {
        p: server.address().port,
        body: idoc
      }, (err, pval) => {

        expect(err).to.equal(undefined);
        expect(pval.statusCode).to.equal(201);

        // Expect an output doc containing the sum of the numbers we sent
        // to have been posted to the sink service
        setTimeout(() => {
          expect(reqmock.batch_post.args[0][0][0][0]).to.equal(
            'http://localhost:9081/sums');
          const odoc = {
            id: 't/0001443650828616/k/bar',
            pairs_id: 't/0001443650828616/k/foo',
            val: 3
          };
          expect(reqmock.batch_post.args[0][0][0][1]).to.deep.equal({
            body: odoc
          });

          // Get the input doc, expecting what we posted
          request.get(pval.headers.location, {}, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(val.body).to.deep.equal({
              id: 't/0001443650828616/k/foo',
              x: 1,
              y: 2
            });

            // Get the output doc, expecting the sum of the numbers we sent
            request.get(pval.body[0], {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
              expect(val.body).to.deep.equal(odoc);

              done();
            });
          });
        }, 500);
      });
    });
});

