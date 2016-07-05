'use strict';

// Simple and configurable map and reduce dataflow transforms

const _ = require('underscore');
const request = require('abacus-request');
const router = require('abacus-router');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const seqid = require('abacus-seqid');
const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');

const extend = _.extend;
const last = _.last;
const rest = _.rest;
const reduce = _.reduce;
const omit = _.omit;
const map = _.map;
const keys = _.keys;

const treduce = transform.reduce;

// Configure test db URL prefix and sink service URLs
process.env.DB = process.env.DB || 'test';

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
  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-dataflow-/, done);
  });

  describe('dataflow map', () => {
    it('runs a map transform and stores its inputs and outputs', (done) => {
  
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
      const itime = (doc) => seqid();
      const orscope = (doc) => undefined;
      const okeys = (doc) => ['' + doc.x + '/' + doc.y];
      const otimes = (doc) => [doc.t];
      const skeys = (doc) => ['' + doc.x];
      const stimes = (doc) => [doc.t];
  
      // Add a dataflow mapper middleware to our test app
      const mapper = dataflow.mapper(sum, {
        input: {
          type: 'pair',
          schema: Pair,
          post: '/v1/pairs',
          get: '/v1/pairs/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-pair',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime
        },
        output: {
          type: 'sum',
          get: '/v1/maps/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-maps',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/maps'],
          keys: skeys,
          times: stimes
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
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/maps');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output doc
          const odoc = odocs[val.body.t];
          expect(omit(
            val.body,'id', 'pair_id', 'processed', 'processed_id'))
            .to.deep.equal(odoc);
          expect(val.body.id).to.match(new RegExp(
            'k/' + odoc.x + '/' + odoc.y + '/t/' + dbclient.pad16(odoc.t)));
          expect(val.body.pair_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x + '/' + odoc.y));
  
          cb(undefined, [[undefined, {
            statusCode: 201
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
          odocs[odoc.t] = odoc;
  
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
              cb();
              return;
            }
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(new RegExp(
                't/00014.*-0-0-0/k/' + idoc.x + '/' + idoc.y));
  
              cb();
            });
          });
        }, undefined, (err, res) => {
          expect(err).to.equal(undefined);
          check();
        });
      });
    });
  
    it('does not store map outputs when error exists', (done) => {
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const Pair = {
        validate: (doc) => doc
      };
  
      // Define a test map transform that computes the sum of a pair of
      // numbers and returns error when sum is above 13
      const smallSum = function *(doc, auth) {
        const val = doc.x + doc.y;
        const res = extend({
          t: doc.t,
          x: doc.x,
          y: doc.y
        }, val > 13 ? {
          error: 'esumabovethirteen',
          reason: 'Sum is above thirteen.'
        } : {
          val: val
        });
        return [res];
      };
  
      // Define key and time functions
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x + '/' + doc.y;
      const itime = (doc) => seqid();
      const orscope = (doc) => undefined;
      const okeys = (doc) => ['' + doc.x + '/' + doc.y];
      const otimes = (doc) => [doc.t];
  
      // Add a dataflow mapper middleware to our test app
      const mapper = dataflow.mapper(smallSum, {
        input: {
          type: 'pair',
          schema: Pair,
          post: '/v1/pairs',
          get: '/v1/pairs/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-pair',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime
        },
        output: {
          type: 'sum',
          get: '/v1/maps/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-maps',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/maps']
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
          if(++checks == 2) done();
        };
  
        // Expect output docs to be posted to the sink service
        const odocs = [];
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/maps');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output doc
          const odoc = odocs[val.body.t];
          expect(omit(
            val.body,'id', 'pair_id', 'processed', 'processed_id'))
            .to.deep.equal(odoc);
          expect(val.body.id).to.match(new RegExp(
            'k/' + odoc.x + '/' + odoc.y + '/t/' + dbclient.pad16(odoc.t)));
          expect(val.body.pair_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x + '/' + odoc.y));
  
          cb(undefined, [[undefined, {
            statusCode: 201
          }]]);
  
          check();
        };
  
        // Post a set of input docs, including no duplicate detection
        // when doc has error.
        treduce([6, 7, 7, 8], (accum, ival, i, l, cb) => {
  
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
          odocs[odoc.t] = odoc;
  
          // Post the input doc
          request.post('http://localhost::p/v1/pairs', {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
  
          }, (err, pval) => {
  
            expect(err).to.equal(undefined);
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
  
            // When ival is above 7, sum is above 13
            if(ival > 6)
              expect(pval.body).to.deep.equal({
                error: 'esumabovethirteen',
                reason: 'Sum is above thirteen.'
              });
  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(new RegExp(
                't/00014.*-0-0-0/k/' + idoc.x + '/' + idoc.y));
  
              cb();
            });
          });
        }, undefined, (err, res) => {
          expect(err).to.equal(undefined);
          check();
        });
      });
    });
  
    it('propagates mapper error from the sink and does not store to output',
      (done) => {
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
        const itime = (doc) => seqid();
        const orscope = (doc) => undefined;
        const okeys = (doc) => ['' + doc.x + '/' + doc.y];
        const otimes = (doc) => [doc.t];
    
        // Add a dataflow mapper middleware to our test app
        const mapper = dataflow.mapper(sum, {
          input: {
            type: 'pair',
            schema: Pair,
            post: '/v1/pairs',
            get: '/v1/pairs/t/:t/k/:kx/:ky',
            dbname: 'abacus-dataflow-pair',
            wscope: iwscope,
            rscope: irscope,
            key: ikey,
            time: itime
          },
          output: {
            type: 'sum',
            get: '/v1/maps/t/:t/k/:kx/:ky',
            dbname: 'abacus-dataflow-maps',
            rscope: orscope,
            keys: okeys,
            times: otimes
          },
          sink: {
            host: 'http://localhost:9081',
            authentication: () => 'Bearer authentication',
            posts: ['/v2/maps']
          }
        });
        app.use(mapper);
    
        app.use(router.batch(app));
    
        // Initiate a replay of any old inputs
        dataflow.replay(mapper, 1000, (err, vals) => {
          expect(err).to.equal(null);
          // 3 docs from previous test are being replayed.
          // 2 are duplicates, when one is processed, the other is not
          expect(vals.length).to.equal(2);
    
          // Listen on an ephemeral port
          const server = app.listen(0);
    
          // Handle callback checks
          let checks = 0;
          const check = () => {
            if(++checks == 4) done();
          };
    
          // Expect output docs to be posted to the sink service
          const odocs = [];
          postspy = (reqs, cb) => {
            expect(reqs[0][0]).to.equal('http://localhost:9081/v2/maps');
    
            const val = reqs[0][1];
            expect(val.headers).to.deep.equal({
              authorization: 'Bearer authentication'
            });
    
            // Check for the expected output doc
            const odoc = odocs[val.body.t];

            expect(omit(
              val.body,'id', 'pair_id', 'processed', 'processed_id'))
              .to.deep.equal(odoc);
            expect(val.body.id).to.match(new RegExp(
              'k/' + odoc.x + '/' + odoc.y + '/t/' + dbclient.pad16(odoc.t)));
            expect(val.body.pair_id).to.match(new RegExp(
              't/00014.*-0-0-0/k/' + odoc.x + '/' + odoc.y));
    
            // sink returns error when val is 27
            cb(undefined, [[undefined, extend({
              statusCode: 201
            }, odoc.val === 27 ? {
              body: {
                error: 'etwentyseven',
                reason: 'localhost:9081 doesn\'t like number 27.'
              }
            } : {})]]);
    
            check();
          };
    
          // Post a set of input docs, including no duplicate detection
          // when doc has error.
          treduce([12, 13, 14], (accum, ival, i, l, cb) => {
    
            // The test input doc
            const idoc = {
              t: t0 + ival + i,
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
            odocs[odoc.t] = odoc;
    
            // Post the input doc
            request.post('http://localhost::p/v1/pairs', {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              body: idoc
    
            }, (err, pval) => {
    
              expect(err).to.equal(undefined);
    
              // Expect a 201 result
              expect(pval.statusCode).to.equal(201);
    
              // When ival is above 13, sum is 27
              if(ival === 13)
                expect(pval.body).to.deep.equal({
                  error: 'esink',
                  reason: [{
                    error: 'etwentyseven',
                    reason: 'localhost:9081 doesn\'t like number 27.'
                  }]
                });
    
              // Get the input doc
              request.get(pval.headers.location, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
    
                expect(omit(val.body,
                  'id', 'processed', 'processed_id')).to.deep.equal(idoc);
                expect(val.body.id).to.match(new RegExp(
                  't/00014.*-0-0-0/k/' + idoc.x + '/' + idoc.y));
    
                cb();
              });
            });
          }, undefined, (err, res) => {
            expect(err).to.equal(undefined);
            check();
          });
        });
      });
    
    it('stores map errors to error db', (done) => {
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const ePair = {
        validate: (doc) => doc
      };
  
      // Define a test map transform that computes the sum of a pair of
      // numbers and returns error when sum is above 13
      const smallSum = function *(doc, auth) {
        const val = doc.x + doc.y;
        const res = extend({
          t: doc.t,
          x: doc.x,
          y: doc.y
        }, val > 13 ? {
          error: 'esumabovethirteen',
          reason: 'Sum is above thirteen.'
        } : {
          val: val
        });
        return [res];
      };
  
      // Define key and time functions
      const t0 = 1443650828616;
      // Some time after submission to get error
      const t1 = 1443650833616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x + '/' + doc.y;
      const itime = (doc) => seqid();
      const orscope = (doc) => undefined;
      const okeys = (doc) => ['' + doc.x + '/' + doc.y];
      const otimes = (doc) => [doc.t];
  
      const ekey = (doc) => '' + doc.x + '/' + doc.y;
      const etime = (doc) => doc.t;
      const erscope = (doc) => undefined;
      const edscope = () => undefined;
  
      // Add a dataflow mapper middleware to our test app
      const mapper = dataflow.mapper(smallSum, {
        input: {
          type: 'epair',
          schema: ePair,
          post: '/v1/epairs',
          get: '/v1/epairs/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-epair',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime
        },
        output: {
          type: 'esum',
          get: '/v1/emaps/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-emaps',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        error: {
          type: 'emap',
          get: '/v1/epairs/t/:t/get/error',
          dbname: 'abacus-dataflow-emap',
          rscope: erscope,
          dscope: edscope,
          key: ekey,
          time: etime
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/maps']
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
          if(++checks == 2) done();
        };
  
        // Expect output docs to be posted to the sink service
        const odocs = [];
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/maps');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output doc
          const odoc = odocs[val.body.t];
          expect(omit(
            val.body,'id', 'epair_id', 'processed', 'processed_id'))
            .to.deep.equal(odoc);
          expect(val.body.id).to.match(new RegExp(
            'k/' + odoc.x + '/' + odoc.y + '/t/' + dbclient.pad16(odoc.t)));
          expect(val.body.epair_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x + '/' + odoc.y));
  
          cb(undefined, [[undefined, {
            statusCode: 201
          }]]);
  
          check();
        };
  
        // Post a set of input docs, including no duplicate detection
        // when doc has error.
        treduce([6, 7, 7, 8], (accum, ival, i, l, cb) => {
  
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
          odocs[odoc.t] = odoc;

          // Handle callback checks
          let cbs = 0;
          const callback = () => {
            if(++cbs == 2) cb();
          };
  
          // Post the input doc
          request.post('http://localhost::p/v1/epairs', {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
  
          }, (err, pval) => {
  
            expect(err).to.equal(undefined);
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
  
            // When ival is above 7, sum is above 13
            if(ival > 6) {
              expect(pval.body).to.deep.equal({
                error: 'esumabovethirteen',
                reason: 'Sum is above thirteen.'
              });
              // Get error docs
              request.get('http://localhost::p/v1/epairs/t/:t/get/error', {
                p: server.address().port,
                t: t1
              }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
  
                // 7 is submitted twice, but there should only be one in the db
                // No duplicate error doc
                if(ival === 7)
                  expect(val.body.length).to.equal(1);
                // Expect error docs for 7 and 8
                else
                  expect(val.body.length).to.equal(2);
  
                // Expect the input doc to be posted with the error & reason
                expect(omit(val.body[0], 'id', 'processed',
                  'processed_id')).to.deep.equal(extend({
                    error: 'esumabovethirteen',
                    reason: 'Sum is above thirteen.'
                  }, idoc));
              
                callback();
              });
            } // No error
            else
              callback();
            
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(new RegExp(
                't/00014.*-0-0-0/k/' + idoc.x + '/' + idoc.y));
    
              callback();
            });
          });
        }, undefined, (err, res) => {
          expect(err).to.equal(undefined);
          check();
        });
      });
    });
  
    it('removes mapper error docs from db', (done) => {
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const ePair = {
        validate: (doc) => doc
      };
  
      // Define a test map transform that computes the sum of a pair of
      // numbers and returns error when sum is above 13
      const smallSum = function *(doc, auth) {
        const val = doc.x + doc.y;
        const res = extend({
          t: doc.t,
          x: doc.x,
          y: doc.y
        }, val > 13 ? {
          error: 'esumabovethirteen',
          reason: 'Sum is above thirteen.'
        } : {
          val: val
        });
        return [res];
      };
  
      // Some time after submission to get error
      const t1 = 1443650833616;
      // Define key and time functions
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x + '/' + doc.y;
      const itime = (doc) => seqid();
      const orscope = (doc) => undefined;
      const okeys = (doc) => ['' + doc.x + '/' + doc.y];
      const otimes = (doc) => [doc.t];
  
      const ekey = (doc) => '' + doc.x + '/' + doc.y;
      const etime = (doc) => doc.t;
      const erscope = (doc) => undefined;
      const edscope = () => undefined;
  
      // Add a dataflow mapper middleware to our test app
      const mapper = dataflow.mapper(smallSum, {
        input: {
          type: 'epair',
          schema: ePair,
          post: '/v1/epairs',
          get: '/v1/epairs/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-epair',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime
        },
        output: {
          type: 'esum',
          get: '/v1/emaps/t/:t/k/:kx/:ky',
          dbname: 'abacus-dataflow-emaps',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        error: {
          type: 'emap',
          get: '/v1/epairs/t/:t/get/error',
          delete: '/v1/epairs/t/:t/k/:kx/:ky/delete/error',
          dbname: 'abacus-dataflow-emap',
          rscope: erscope,
          dscope: edscope,
          key: ekey,
          time: etime
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/maps']
        }
      });
      app.use(mapper);
  
      app.use(router.batch(app));
  
      // Initiate a replay of any old inputs
      dataflow.replay(mapper, 1000, (err, vals) => {
        expect(err).to.equal(null);
        // Expect no input docs with error to be replayed.
        expect(vals).to.deep.equal([]);
  
        // Listen on an ephemeral port
        const server = app.listen(0);
  
        // Handle callback checks
        let checks = 0;
        const check = () => {
          if(++checks == 3) done();
        };
  
        request.get('http://localhost::p/v1/epairs/t/:t/get/error', {
          p: server.address().port,
          auth: {
            bearer: 'test'
          },
          t: '' + t1 + '-0-0-0-0' // anytime after the last error doc
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
    
          // Expect the 2 error that were stored from previous run
          expect(val.body.length).to.equal(2);

          // Tests delete doc that doesn't exist
          request.delete('http://localhost::p/v1/epairs' +
            '/t/:t/k/:kx/:ky/delete/error', {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              kx: 1,
              ky: 2,
              t: t1
            }, (err, val) => {
              expect(val.statusCode).to.equal(404);
              expect(err).to.equal(undefined);
              check();
            });
  
          map(val.body, (edoc) => {
            request.delete('http://localhost::p/v1/epairs' +
              '/t/:t/k/:kx/:ky/delete/error', {
                p: server.address().port,
                auth: {
                  bearer: 'test'
                },
                kx: edoc.x,
                ky: edoc.y,
                t: edoc.t
              }, (err, val) => {
                expect(val.statusCode).to.equal(200);
                expect(omit(val.body, 'rev')).to.deep.equal({
                  ok: true,
                  id: 't/000' + edoc.t + '/k/' + edoc.x + '/' + edoc.y
                });
  
                check();
              });
          });
        });
      });
    });
  });

  describe('dataflow reducer', () => {
    it('runs a reduce transform and stores its inputs and outputs', (done) => {
  
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };
  
      // Define a test reduce transform that accumulates the sum of 
      // numbers
      const sum = function *(accums, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = {
            t: doc.t,
            x: doc.x,
            val: last(log)[0].val + doc.x
          };
          return log.concat([[res]]);
        }, [accums[0] ? accums : [{
          val: 0
        }, {}]]));
      };
  
      // Define key, time and group functions
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
      const orscope = (doc) => undefined;
      const okeys = (doc) => igroups(doc);
      const otimes = (doc) => [doc.t];
      const skeys = (doc) => igroups(doc);
      const stimes = (doc) => [doc.t];
  
      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(sum, {
        input: {
          type: 'nb',
          schema: Nb,
          post: '/v1/nbs',
          get: '/v1/nbs/t/:t/k/:kx',
          dbname: 'abacus-dataflow-nbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-reductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions'],
          keys: skeys,
          times: stimes
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
          if(++checks == 8) done();
        };
  
        // Expect output docs to be posted to the sink service
        const oaccum = {
          odd: {
            val: 9
          },
          even: {
            val: 6
          }
        };
  
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/reductions');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output docs
          const odoc = val.body;
          expect(odoc.id).to.match(new RegExp(
            'k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
          expect(odoc.nb_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x));
  
          map(keys(oaccum), (group) => {
            try {
              expect(omit(odoc,
                'id', 'nb_id', 'processed', 'processed_id', 't', 'x'))
                .to.deep.equal(oaccum[group]);
              check();
            }
            catch(e) {
            }
          });
  
          cb(undefined, [[undefined, {
            statusCode: 201
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
              cb();
              return;
            }
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/00014.*-0-0-0/k/' + idoc.x));
  
              cb();
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
  
    it('runs a reduce transform and down samples outputs', (done) => {
  
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };
  
      // Define a test reduce transform that accumulates the sum of 
      // numbers
      const sum = function *(accums, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = {
            t: doc.t,
            x: doc.x,
            val: last(log)[0].val + doc.x
          };
          return log.concat([[res, {}]]);
        }, [accums[0] ? accums : [{
          val: 0
        }, {}]]));
      };
  
      // Define key, time and group functions
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
      const orscope = (doc) => undefined;
      const okeys = (doc) => [igroups(doc)[0], doc.x];
      const otimes = (doc, itime) => [seqid.sample(itime, 3600000), 0];
  
      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(sum, {
        input: {
          type: 'nb',
          schema: Nb,
          post: '/v1/nbs',
          get: '/v1/nbs/t/:t/k/:kx',
          dbname: 'abacus-dataflow-sampnbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-sampreductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions']
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
          if(++checks == 8) done();
        };
  
        // Expect output docs to be posted to the sink service
        const oaccum = {
          odd: {
            val: 9
          },
          even: {
            val: 6
          }
        };
  
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/reductions');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output docs
          const odoc = val.body;
          expect(odoc.id).to.match(new RegExp(
            'k/' + igroups(odoc).join('/') + '/t/00014.*-0-0-0'));
          expect(odoc.nb_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x));
  
          map(keys(oaccum), (group) => {
            try {
              expect(omit(odoc,
                'id', 'nb_id', 'processed', 'processed_id', 't', 'x'))
                .to.deep.equal(oaccum[group]);
              check();
            }
            catch(e) {
            }
          });
  
          cb(undefined, [[undefined, {
            statusCode: 201
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
              cb();
              return;
            }
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/00014.*-0-0-0/k/' + idoc.x));
  
              cb();
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

    it('does not store reduce outputs when error exists', (done) => {
  
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };
  
      // Define a test reduce transform that accumulates the sum of 
      // numbers
      const bigSum = function *(accums, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = extend({
            t: doc.t,
            x: doc.x
          }, doc.x > 6 ? {
            val: last(log)[0].val + doc.x
          } : {
            error: 'exsmallerthanseven',
            reason: 'X is smaller than seven.'
          });
          return log.concat([[res]]);
        }, [[
          accums[0] ? accums[0] : {
            val: 0
          }
        ]]));
      };
  
      // Define key, time and group functions
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
      const orscope = (doc) => undefined;
      const okeys = (doc) => igroups(doc);
      const otimes = (doc) => [doc.t];
  
      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(bigSum, {
        input: {
          type: 'nb',
          schema: Nb,
          post: '/v1/nbs',
          get: '/v1/nbs/t/:t/k/:kx',
          dbname: 'abacus-dataflow-nbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-reductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions']
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
          if(++checks == 2) done();
        };
  
        // Expect output docs to be posted to the sink service
        const oaccum = {
          odd: {
            val: 9
          },
          even: {
            val: 6
          }
        };
  
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/reductions');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output docs
          const odoc = val.body;
          expect(odoc.id).to.match(new RegExp(
            'k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
          expect(odoc.nb_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x));
  
          map(keys(oaccum), (group) => {
            try {
              expect(omit(odoc,
                'id', 'nb_id', 'processed', 'processed_id', 't', 'x'))
                .to.deep.equal(oaccum[group]);
              check();
            }
            catch(e) {
            }
          });
  
          cb(undefined, [[undefined, {
            statusCode: 201
          }]]);
  
          check();
        };
  
        // Post a set of input docs
        treduce([6, 6, 7], (accum, ival, i, l, cb) => {
  
          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival
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
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
            if (ival < 7)
              expect(pval.body).to.deep.equal({
                error: 'exsmallerthanseven',
                reason: 'X is smaller than seven.'
              });
  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/00014.*-0-0-0/k/' + idoc.x));
  
              cb();
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
  
    it('propagates reducer error from the sink and does not store to output',
      (done) => {
  
        // Create a test Web app
        const app = webapp();
    
        // Create a schema for our test docs, representing pairs of numbers
        const Nb = {
          validate: (doc) => doc
        };
    
        // Define a test reduce transform that accumulates the sum of 
        // numbers
        const bigSum = function *(accums, docs, auth) {
          return rest(reduce(docs, (log, doc) => {
            const res = {
              t: doc.t,
              x: doc.x,
              val: last(log)[0].val + doc.x
            };
            return log.concat([[res]]);
          }, [[
            accums[0] ? accums[0] : {
              val: 0
            }
          ]]));
        };
    
        // Define key, time and group functions
        const t0 = 1443650828626;
        const iwscope = (doc) => undefined;
        const irscope = (doc) => undefined;
        const ikey = (doc) => '' + doc.x;
        const itime = (doc) => seqid();
        const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
        const orscope = (doc) => undefined;
        const okeys = (doc) => igroups(doc);
        const otimes = (doc) => [doc.t];
    
        // Add a dataflow reducer middleware to our test app
        const reducer = dataflow.reducer(bigSum, {
          input: {
            type: 'nb',
            schema: Nb,
            post: '/v1/nbs',
            get: '/v1/nbs/t/:t/k/:kx',
            dbname: 'abacus-dataflow-nbs',
            wscope: iwscope,
            rscope: irscope,
            key: ikey,
            time: itime,
            groups: igroups
          },
          output: {
            type: 'sum',
            get: '/v1/reductions/t/:t/k/:kg',
            dbname: 'abacus-dataflow-reductions',
            rscope: orscope,
            keys: okeys,
            times: otimes
          },
          sink: {
            host: 'http://localhost:9081',
            authentication: () => 'Bearer authentication',
            posts: ['/v2/reductions']
          }
        });
        app.use(reducer);
    
        app.use(router.batch(app));
    
        // Replay any old inputs
        dataflow.replay(reducer, 1000, (err, vals) => {
          expect(err).to.equal(null);
          // expect the 2 error from previous run to be replayed
          // only 1 because they're duplicates and the second shouldn't
          // be processed when 1 succeeded.
          expect(vals.length).to.deep.equal(1);
    
          // Listen on an ephemeral port
          const server = app.listen(0);
    
          // Handle callback checks
          let checks = 0;
          const check = () => {
            if(++checks == 4) done();
          };
    
          // Expect output docs to be posted to the sink service
          const oaccum = {
            odd: {
              val: 9
            },
            even: {
              val: 6
            }
          };
    
          postspy = (reqs, cb) => {
            expect(reqs[0][0]).to.equal('http://localhost:9081/v2/reductions');
    
            const val = reqs[0][1];
            expect(val.headers).to.deep.equal({
              authorization: 'Bearer authentication'
            });
    
            // Check for the expected output docs
            const odoc = val.body;
            expect(odoc.id).to.match(new RegExp(
              'k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
            expect(odoc.nb_id).to.match(new RegExp(
              't/00014.*-0-0-0/k/' + odoc.x));
    
            map(keys(oaccum), (group) => {
              try {
                expect(omit(odoc,
                  'id', 'nb_id', 'processed', 'processed_id', 't', 'x'))
                  .to.deep.equal(oaccum[group]);
                check();
              }
              catch(e) {
              }
            });
    
            cb(undefined, [[undefined, extend({
              statusCode: 201
            }, odoc.x === 9 ? {
              body: {
                error: 'enine',
                reason: 'localhost:9881 doesn\'t like x = 9.'
              }
            } : {})]]);
    
            check();
          };
    
          // Post a set of input docs
          treduce([8, 9, 10], (accum, ival, i, l, cb) => {
    
            // The test input doc
            const idoc = {
              t: t0 + ival + i,
              x: ival
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
    
              // Expect a 201 result
              expect(pval.statusCode).to.equal(201);
              if (ival === 9)
                expect(pval.body).to.deep.equal({
                  error: 'esink',
                  reason: [{
                    error: 'enine',
                    reason: 'localhost:9881 doesn\'t like x = 9.'
                  }]
                });
    
              // Get the input doc
              request.get(pval.headers.location, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
    
                expect(omit(val.body,
                  'id', 'processed', 'processed_id')).to.deep.equal(idoc);
                expect(val.body.id).to.match(
                  new RegExp('t/00014.*-0-0-0/k/' + idoc.x));
    
                cb();
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
  
    it('does batch post, and gather the errors', (done) => {
  
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const Multi = {
        validate: (doc) => doc
      };
  
      // Define a test reduce transform that generate 3 docs(mimic aggregator)
      const multiDoc = function *(accums, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = [{
            t: doc.t,
            x: doc.x,
            val: last(log)[0].val + doc.x
          }, {
            t: doc.t,
            x: doc.x + 1,
            val: last(log)[0].val + doc.x + 1
          }, {
            t: doc.t,
            x: doc.x + 2,
            val: last(log)[0].val + doc.x + 2
          }];
          return log.concat([res]);
        }, [[
          accums[0] ? accums[0] : {
            val: 0
          }
        ]]));
      };  
      // Define key, time and group functions
      const t0 = 1443650828626;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => ['first', 'second', 'third'];
      const orscope = (doc) => undefined;
      const okeys = (doc) => igroups(doc);
      const otimes = (doc) => [doc.t, doc.t, doc.t];  
      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(multiDoc, {
        input: {
          type: 'multi',
          schema: Multi,
          post: '/v1/multis',
          get: '/v1/multis/t/:t/k/:kx',
          dbname: 'abacus-dataflow-multis',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-reductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions', '/v2/reductions', '/v2/reductions']
        }
      });
      app.use(reducer);  
      app.use(router.batch(app));  
      // Replay any old inputs
      dataflow.replay(reducer, 1000, (err, vals) => {
        expect(err).to.equal(null);
        // expect the 2 error from previous run to be replayed
        expect(vals).to.deep.equal([]);  
        // Listen on an ephemeral port
        const server = app.listen(0);  
        // Handle callback checks
        let checks = 0;
        const check = () => {
          if(++checks == 2) done();
        };  
        // Expect output docs to be posted to the sink service
        const oaccum = {
          odd: {
            val: 9
          },
          even: {
            val: 6
          }
        };  
        postspy = (reqs, cb) => {
          let i = 0;
          while(i < reqs.length) {
            expect(reqs[i][0]).to.equal('http://localhost:9081' +
              '/v2/reductions');  
  
            const val = reqs[i][1];
    
            expect(val.headers).to.deep.equal({
              authorization: 'Bearer authentication'
            });  
            // Check for the expected output docs
            const odoc = val.body;
            expect(odoc.id).to.match(new RegExp(
              'k/' + [igroups(odoc)[i]].join('/') + '/t/' +
              dbclient.pad16(odoc.t)));
            expect(odoc.multi_id).to.match(new RegExp(
              't/00014.*-0-0-0/k/' + (odoc.x - i)));
    
            map(keys(oaccum), (group) => {
              try {
                expect(omit(odoc,
                  'id', 'multi_id', 'processed', 'processed_id', 't', 'x'))
                  .to.deep.equal(oaccum[group]);
                check();
              }
              catch(e) {
              }
            });
            i++;
          }
  
          // Simulate return values of the sink. 2 error, 1 success.
          cb(undefined, [[undefined, {
            statusCode: 201,
            body: {
              error: 'efirstdoc',
              reason: 'test forces first doc to give error'
            }
          }], [undefined, {
            statusCode: 201
          }], [undefined, {
            statusCode: 201,
            body: {
              error: 'ethirddoc',
              reason: 'test forces third doc to give error'
            }
          }]]);
  
          check();
        };
  
        // Post an input doc
        treduce([15], (accum, ival, i, l, cb) => {  
          // The test input doc
          const idoc = {
            t: t0 + ival + i,
            x: ival
          };  
          // Post input doc
          request.post('http://localhost::p/v1/multis', {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          }, (err, pval) => {  
            expect(err).to.equal(undefined);  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);
            expect(pval.body).to.deep.equal({
              error: 'esink',
              reason: [{
                error: 'efirstdoc',
                reason: 'test forces first doc to give error'
              }, {
                error: 'ethirddoc',
                reason: 'test forces third doc to give error'
              }]
            });  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/00014.*-0-0-0/k/' + idoc.x));  
              cb();
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

    it('stores reducer errors to error db', (done) => {
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const eNb = {
        validate: (doc) => doc
      };
  
      // Define a test reduce transform that accumulates the sum of 
      // numbers
      const bigSum = function *(accums, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = extend({
            t: doc.t,
            x: doc.x
          }, doc.x > 6 ? {
            val: last(log)[0].val + doc.x
          } : {
            error: 'exsmallerthanseven',
            reason: 'X is smaller than seven.'
          });
          return log.concat([[res]]);
        }, [[
          accums[0] ? accums[0] : {
            val: 0
          }
        ]]));
      };
  
      // Define key, time and group functions
      const t0 = 1443650828616;
      // Some time after submission to get error
      const t1 = 1443650833616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
      const orscope = (doc) => undefined;
      const okeys = (doc) => igroups(doc);
      const otimes = (doc) => [doc.t];

      const ekey = (doc) => '' + doc.x;
      const etime = (doc) => doc.t;
      const erscope = (doc) => undefined;
      const edscope = () => undefined;
  
      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(bigSum, {
        input: {
          type: 'enb',
          schema: eNb,
          post: '/v1/enbs',
          get: '/v1/enbs/t/:t/k/:kx',
          dbname: 'abacus-dataflow-enbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'esum',
          get: '/v1/ereductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-ereductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        error: {
          type: 'ereducer',
          get: '/v1/enbs/t/:t/get/error',
          delete: '/v1/enbs/t/:t/k/:kx/:ky/delete/error',
          dbname: 'abacus-dataflow-ereducer',
          rscope: erscope,
          dscope: edscope,
          key: ekey,
          time: etime
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions']
        }
      });
      app.use(reducer);
  
      app.use(router.batch(app));
  
      // Replay any old inputs
      dataflow.replay(reducer, 1000, (err, vals) => {
        expect(err).to.equal(null);
        // Expect no input docs with error to be replayed
        expect(vals).to.deep.equal([]);
  
        // Listen on an ephemeral port
        const server = app.listen(0);
  
        // Handle callback checks
        let checks = 0;
        const check = () => {
          if(++checks == 2) done();
        };
  
        // Expect output docs to be posted to the sink service
        const oaccum = {
          odd: {
            val: 9
          },
          even: {
            val: 6
          }
        };
  
        postspy = (reqs, cb) => {
          expect(reqs[0][0]).to.equal('http://localhost:9081/v2/reductions');
  
          const val = reqs[0][1];
          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
  
          // Check for the expected output docs
          const odoc = val.body;
          expect(odoc.id).to.match(new RegExp(
            'k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
          expect(odoc.enb_id).to.match(new RegExp(
            't/00014.*-0-0-0/k/' + odoc.x));
  
          map(keys(oaccum), (group) => {
            try {
              expect(omit(odoc,
                'id', 'enb_id', 'processed', 'processed_id', 't', 'x'))
                .to.deep.equal(oaccum[group]);
              check();
            }
            catch(e) {
            }
          });
  
          cb(undefined, [[undefined, {
            statusCode: 201
          }]]);
  
          check();
        };
  
        // Post a set of input docs
        treduce([6, 6, 7], (accum, ival, i, l, cb) => {
  
          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival
          };

          // Handle callback checks
          let cbs = 0;
          const callback = () => {
            if(++cbs == 2) cb();
          };
  
          // Post input doc
          request.post('http://localhost::p/v1/enbs', {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          }, (err, pval) => {
  
            expect(err).to.equal(undefined);
  
            // Expect a 201 result
            expect(pval.statusCode).to.equal(201);

            // There is error
            if (ival < 7) {
              expect(pval.body).to.deep.equal({
                error: 'exsmallerthanseven',
                reason: 'X is smaller than seven.'
              });

              // Get error docs
              request.get('http://localhost::p/v1/enbs/t/:t/get/error', {
                p: server.address().port,
                auth: {
                  bearer: 'test'
                },
                t: t1
              }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                // 6 is submitted twice, but there should only be one in the db
                // No duplicate error doc
                expect(val.body.length).to.equal(1);

                // Expect the input doc to be posted with the error and reason
                expect(omit(val.body[0], 'id', 'processed', 'processed_id'))
                  .to.deep.equal(extend({
                    error: 'exsmallerthanseven',
                    reason: 'X is smaller than seven.'
                  }, idoc));

                callback();
              });
            } // No error
            else
              callback();
  
            // Get the input doc
            request.get(pval.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
  
              expect(omit(val.body,
                'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(
                new RegExp('t/00014.*-0-0-0/k/' + idoc.x));
  
              callback();
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

    it('removes reducer errors docs from db', (done) => {
      // Create a test Web app
      const app = webapp();
  
      // Create a schema for our test docs, representing pairs of numbers
      const eNb = {
        validate: (doc) => doc
      };
  
      // Define a test reduce transform that accumulates the sum of 
      // numbers
      const bigSum = function *(accums, docs, auth) {
        return rest(reduce(docs, (log, doc) => {
          const res = extend({
            t: doc.t,
            x: doc.x
          }, doc.x > 6 ? {
            val: last(log)[0].val + doc.x
          } : {
            error: 'exsmallerthanseven',
            reason: 'X is smaller than seven.'
          });
          return log.concat([[res]]);
        }, [[
          accums[0] ? accums[0] : {
            val: 0
          }
        ]]));
      };
  
      // Some time after submission to get error
      const t1 = 1443650833616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
      const orscope = (doc) => undefined;
      const okeys = (doc) => igroups(doc);
      const otimes = (doc) => [doc.t];

      const ekey = (doc) => '' + doc.x;
      const etime = (doc) => doc.t;
      const erscope = (doc) => undefined;
      const edscope = () => undefined;
  
      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(bigSum, {
        input: {
          type: 'enb',
          schema: eNb,
          post: '/v1/enbs',
          get: '/v1/enbs/t/:t/k/:kx',
          dbname: 'abacus-dataflow-enbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'esum',
          get: '/v1/ereductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-ereductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        error: {
          type: 'ereducer',
          get: '/v1/enbs/t/:t/get/error',
          delete: '/v1/enbs/t/:t/k/:kx/delete/error',
          dbname: 'abacus-dataflow-ereducer',
          rscope: erscope,
          dscope: edscope,
          key: ekey,
          time: etime
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions']
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
          if(++checks == 2) done();
        };

        // Get error docs
        request.get('http://localhost::p/v1/enbs/t/:t/get/error', {
          p: server.address().port,
          auth: {
            bearer: 'test'
          },
          t: '' + t1 + '-0-0-0-0' // anytime after the last error doc
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Expect the error that were stored from previous run
          expect(val.body.length).to.equal(1);

          request.delete('http://localhost::p/v1/enbs/t/:t/k/:kx' +
            '/delete/error', {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              kx: 1,
              t: t1
            }, (err, val) => {
              expect(val.statusCode).to.equal(404);
              expect(err).to.equal(undefined);
              check();
            });

          const edoc = val.body[0];

          request.delete('http://localhost::p/v1/enbs/t/:t/k/:kx' +
            '/delete/error', {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              kx: edoc.x,
              t: edoc.t
            }, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
              expect(omit(val.body, 'rev')).to.deep.equal({
                ok: true,
                id: edoc.id
              });
              check();
            });
        });
      });
    });
  });
   /* eslint no-unused-expressions: 1  */
  describe('dataflow sink', () => {

    const localsink = 'http://localhost:1000';
    const remotesink = 'http://abacus.example.org';
    const k1 = 'k/k1/t/1';
    const k2 = 'k/k2/t/1';

    yieldable.functioncb(dataflow.sink)(k1, localsink, 2, (err, uri) => {
      expect(err).not.to.ok;
      expect(uri).to.equal('http://localhost:1000');
    });
    yieldable.functioncb(dataflow.sink)(k2, localsink, 2, (err, uri) => {
      expect(err).not.to.ok;
      expect(uri).to.equal('http://localhost:1001');
    });
    yieldable.functioncb(dataflow.sink)(k1, remotesink, 2, (err, uri) => {
      expect(err).not.to.ok;
      expect(uri).to.equal('http://abacus-0.example.org');
    });
    yieldable.functioncb(dataflow.sink)(k2, remotesink, 2, (err, uri) => {
      expect(err).not.to.ok;
      expect(uri).to.equal('http://abacus-1.example.org');
    });
  });
});
