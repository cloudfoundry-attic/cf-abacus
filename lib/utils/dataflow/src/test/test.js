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
const reqmock = extend({}, request, {
  batch_get: spy((reqs, cb) => cb(undefined, [[undefined, {
    statusCode: 200
  }]])),
  batch_post: spy((reqs, cb) => cb(undefined, [[undefined, {
    statusCode: 200
  }]]))
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
          post: '/v2/maps'
        }
      });
      app.use(mapper);

      app.use(router.batch(app));

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Post a set of input docs, including a duplicate
      treduce([1, 2, 3, 3, 4, 5], (accum, ival, i, l, cb) => {

        // The test input doc
        const idoc = {
          t: t0 + ival,
          x: ival,
          y: ival + 1
        };

        // The expected output doc
        const oval = idoc.x + idoc.y;
        const odoc = {
          t: idoc.t,
          x: idoc.x,
          y: idoc.y,
          val: oval
        };

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

            expect(omit(val.body, 'id')).to.deep.equal(idoc);
            expect(val.body.id).to.match(new RegExp(
              't/000' + idoc.t + '/.*/k/' + idoc.x + '/' + idoc.y));

            // Expect an output doc to have been posted to the sink service
            setTimeout(() => {
              const args = last(reqmock.batch_post.args)[0][0];
              expect(args[0]).to.equal(
                'http://localhost:9081/v2/maps');

              const val = args[1];
              expect(val.headers).to.deep.equal({
                authorization: 'Bearer test'
              });
              expect(omit(val.body,'id', 'pair_id')).to.deep.equal(odoc);
              expect(val.body.id).to.match(new RegExp(
                'k/' + idoc.x + '/' + idoc.y + '/t/000' + idoc.t));
              expect(val.body.pair_id).to.match(new RegExp(
                't/000' + idoc.t + '/.*/k/' + idoc.x + '/' + idoc.y));

              cb();
            }, 100);
          });
        });
      }, undefined, (err, res) => {
        expect(err).to.equal(undefined);
        done();
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
          post: '/v2/reductions'
        }
      });
      app.use(reducer);

      app.use(router.batch(app));

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Post a set of input docs
      treduce([1, 2, 3, 3, 4, 5], (accum, ival, i, l, cb) => {

        // The test input doc
        const idoc = {
          t: t0 + ival,
          x: ival
        };

        // The expected output doc
        const oval = accum[ogroup(idoc)] + idoc.x;
        const odoc = {
          t: idoc.t,
          x: idoc.x,
          val: oval
        };

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

          // Expect an output doc to have been posted to the sink service
          setTimeout(() => {
            expect(last(reqmock.batch_post.args)[0][0][0]).to.equal(
              'http://localhost:9081/v2/reductions');
            expect(last(
              reqmock.batch_post.args)[0][0][1].headers).to.deep.equal({
                authorization: 'Bearer test'
              });
            expect(omit(last(
                reqmock.batch_post.args)[0][0][1].body,
                'id', 'nb_id')).to.deep.equal(odoc);

            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body, 'id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/000' + idoc.t + '/.*/k/' + idoc.x));

              // Get the output doc
              request.get(pval.body[1], {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
                expect(omit(val.body, 'id', 'nb_id')).to.deep.equal(odoc);

                // expect(val.body.id).to.match(
                  // new RegExp('k/' + ogroup(idoc.x) + '/t/000' + idoc.t));
                // expect(val.body.nb_id).to.match(
                  // new RegExp('t/000' + idoc.t + '/.*/k/' + ogroup(idoc.x)));

                cb(undefined, naccum);
              });
            });
          }, 100);
        });
      }, {
        even: 0,
        odd: 0
      }, (err, res) => {
        expect(err).to.equal(undefined);
        done();
      });
    });
});
