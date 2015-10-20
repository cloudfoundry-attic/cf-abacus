'use strict';

// Simple and configurable map and reduce dataflow transforms

const _ = require('underscore');
const request = require('abacus-request');
const router = require('abacus-router');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const seqid = require('abacus-seqid');

const extend = _.extend;
const last = _.last;
const rest = _.rest;
const reduce = _.reduce;
const omit = _.omit;

const treduce = transform.reduce;

// Configure test db URL prefix and sink service URLs
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const webapp = require('abacus-webapp');

// Mock the request module
let postspy;
const reqmock = extend({}, request, {
  batch_post: (reqs, cb) => postspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

const dataflow = require('..');

describe('abacus-dataflow', () => {
  it('runs a map transform and stores its inputs and outputs',
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
      const sum = function *(doc, auth) {
        const res = {
          t: doc.t,
          x: doc.x,
          y: doc.y,
          val: doc.x + doc.y
        };
        return [res];
      };

      // Define key and time functions
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x + '/' + doc.y;
      const itime = (doc) => [doc.t, seqid()].join('/');
      const utime = (doc) => doc.t;
      const orscope = (doc) => undefined;
      const okey = (doc) => '' + doc.x + '/' + doc.y;
      const otime = (doc) => [doc.t, seqid()].join('/');

      // Add a dataflow mapper middleware to our test app
      const mapper = dataflow.mapper(sum, {
        input: {
          type: 'pair',
          schema: Pair,
          post: '/v1/pairs',
          get: '/v1/pairs/t/:t/:ts/k/:kx/:ky',
          dbname: 'pair',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          utime: utime
        },
        output: {
          type: 'sum',
          get: '/v1/maps/t/:t/:ts/k/:kx/:ky',
          dbname: 'maps',
          rscope: orscope,
          key: okey,
          time: otime
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          post: '/v2/maps'
        }
      });
      app.use(mapper);

      app.use(router.batch(app));

      // Initiate a replay of any old inputs
      dataflow.replay(mapper, 1000, (err, vals) => {
        expect(err).to.equal(null);
        expect(vals).to.deep.equal([]);

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Handle callback checks
        let checks = 0;
        const check = () => {
          if(++checks == 6) done();
        };

        // Expect output docs to be posted to the sink service
        const odocs = [];
        let posts = 0;
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/maps');

          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });

          // Check for the expected output doc
          const odoc = odocs[posts];
          expect(omit(
            val.body,'id', 'pair_id', 'processed')).to.deep.equal(odoc);
          expect(val.body.id).to.match(new RegExp(
            'k/' + odoc.x + '/' + odoc.y + '/t/000' + odoc.t));
          expect(val.body.pair_id).to.match(new RegExp(
            't/000' + odoc.t + '/.*/k/' + odoc.x + '/' + odoc.y));

          posts++;

          cb(undefined, [[undefined, {
            statusCode: 200
          }]]);

          check();
        };

        // Post a set of input docs, including a duplicate
        treduce([1, 2, 3, 3, 4, 5], (accum, ival, i, l, cb) => {

          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival,
            y: ival + 1
          };

          // The expected output doc
          const odoc = {
            t: idoc.t,
            x: idoc.x,
            y: idoc.y,
            val: idoc.x + idoc.y
          };
          odocs[i < 3 ? i : i - 1] = odoc;

          // Post the input doc
          request.post('http://localhost::p/v1/pairs', {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc

          }, (err, pval) => {

            expect(err).to.equal(undefined);

            if(i === 3) {
              // Expect a duplicate to be detected
              expect(pval.statusCode).to.equal(409);
              return cb();
            }

            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);

            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body, 'id', 'processed')).to.deep.equal(idoc);
              expect(val.body.id).to.match(new RegExp(
                't/000' + idoc.t + '/.*/k/' + idoc.x + '/' + idoc.y));

              cb();
            });
          });
        }, undefined, (err, res) => {
          expect(err).to.equal(undefined);
          check();
        });
      });
    });

  it('runs a reduce transform and stores its inputs and outputs',
    function(done) {
      this.timeout(60000);

      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };

      // Define a test reduce transform that accumulates the sum of 
      // numbers
      const sum = function *(accum, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = {
            t: doc.t,
            x: doc.x,
            val: last(log)[0].val + doc.x
          }
          return log.concat([[res]]);
        }, [[
          accum ? accum : {
            val: 0
          }
        ]]));
      };

      // Define key, time and group functions
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => [doc.t, seqid()].join('/');
      const utime = (doc) => doc.t;
      const ogroup = (doc) => doc.x % 2 ? 'odd' : 'even';
      const orscope = (doc) => undefined;
      const okey = (doc) => ogroup(doc);
      const otime = (doc) => [doc.t, seqid()].join('/');

      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(sum, {
        input: {
          type: 'nb',
          schema: Nb,
          post: '/v1/nbs',
          get: '/v1/nbs/t/:t/:ts/k/:kx',
          dbname: 'nbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          utime: utime
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/:ts/k/:kg',
          dbname: 'reductions',
          rscope: orscope,
          key: okey,
          time: otime,
          group: ogroup
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          post: '/v2/reductions'
        }
      });
      app.use(reducer);

      app.use(router.batch(app));

      // Replay any old inputs
      dataflow.replay(reducer, 1000, (err, vals) => {
        expect(err).to.equal(null);
        expect(vals).to.deep.equal([]);

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Handle callback checks
        let checks = 0;
        const check = () => {
          if(++checks == 6) done();
        };

        // Expect output docs to be posted to the sink service
        const odocs = [];
        let posts = 0;
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/reductions');

          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });

          // The expected output doc
          const odoc = odocs[posts];

          expect(omit(
            val.body,'id', 'nb_id', 'processed')).to.deep.equal(odoc);
          expect(val.body.id).to.match(new RegExp(
            'k/' + ogroup(odoc) + '/t/000' + odoc.t));
          expect(val.body.nb_id).to.match(new RegExp(
            't/000' + odoc.t + '/.*/k/' + odoc.x));

          posts++;

          cb(undefined, [[undefined, {
            statusCode: 200
          }]]);

          check();
        };

        // Post a set of input docs
        treduce([1, 2, 3, 3, 4, 5], (accum, ival, i, l, cb) => {

          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival
          };

          // The expected output doc
          const oval = accum[ogroup(idoc)] + (i !== 3 ? idoc.x : 0);
          const odoc = {
            t: idoc.t,
            x: idoc.x,
            val: oval
          };
          if(i !== 3)
            odocs[i < 3 ? i : i - 1] = odoc;

          // The new accumulated value
          const naccum = {
            even: ogroup(idoc) === 'even' ? oval : accum.even,
            odd: ogroup(idoc) === 'odd' ? oval : accum.odd
          };

          // Post input doc
          request.post('http://localhost::p/v1/nbs', {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          }, (err, pval) => {

            expect(err).to.equal(undefined);

            if(i === 3) {
              // Expect a duplicate to be detected
              expect(pval.statusCode).to.equal(409);
              return cb(undefined, accum);
            }

            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);

            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body, 'id', 'processed')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/000' + idoc.t + '/.*/k/' + idoc.x));

              cb(undefined, naccum);
            });
          });
        }, {
          even: 0,
          odd: 0
        }, (err, res) => {
          expect(err).to.equal(undefined);
          check();
        });
      });
    });
});
