'use strict';

// Simple and configurable map and reduce dataflow transforms

const _ = require('underscore');
const request = require('abacus-request');
const router = require('abacus-router');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const seqid = require('abacus-seqid');
const dbclient = require('abacus-dbclient');

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
  it('runs a map transform and stores its inputs and outputs', (done) => {

    // Create a test Web app
    const app = webapp();

    // Create a schema for our test docs, representing pairs of numbers
    const Pair = {
      validate: (doc) => doc
    };

    // Define a test map transform that computes the sum of a pair of
    // numbers
    const sumBelowEightAndAboveTwelve = function *(doc, auth) {
      const val = doc.x + doc.y;
      const res = {
        t: doc.t,
        x: doc.x,
        y: doc.y
      };
      extend(res, val > 8 && val < 13 ? {
        error: true,
        reasons: ['sum is not below 8']
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
    const erscope = (doc) => undefined;
    const okeys = (doc) => ['' + doc.x + '/' + doc.y];
    const otimes = (doc) => [doc.t];

    // Add a dataflow mapper middleware to our test app
    const mapper = dataflow.mapper(sumBelowEightAndAboveTwelve, {
      input: {
        type: 'pair',
        schema: Pair,
        post: '/v1/pairs',
        get: '/v1/pairs/t/:t/k/:kx/:ky',
        dbname: 'pair',
        wscope: iwscope,
        rscope: irscope,
        key: ikey,
        time: itime
      },
      output: {
        type: 'sum',
        get: '/v1/maps/t/:t/k/:kx/:ky',
        dbname: 'maps',
        rscope: orscope,
        keys: okeys,
        times: otimes
      },
      error: {
        get: '/v1/pairs/t/:t/k/:kx/:ky/error',
        dbname: 'pairerror',
        rscope: erscope
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
        if(++checks === 5) done();
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

        cb(undefined, [[undefined, extend({
          statusCode: 201
        }, val.body.val === 13 ? {
          body: {
            error: true,
            reasons: ['9081 cannot accept sum equal to 13']
          }
        } : {})]]);

        check();
      };

      // Post a set of input docs, including a duplicate
      treduce([1, 2, 3, 3, 4, 5, 6], (accum, ival, i, l, cb) => {

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

          // Post to error db instead of output and sink. Get error
          if(ival === 4 || ival === 5)
            request.get(pval.headers.location + '/error', {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body[0], 'id', 'processed', 'pair_id',
                'processed_id')).to.deep.equal(extend({}, idoc, {
                  reasons: ['sum is not below 8'],
                  error: true
                }));
              expect(val.body[0].id).to.match(new RegExp(
                't/00014.*-0-0-0/k/' + idoc.x + '/' + idoc.y));
              // First error will returns 1 error doc, second will returns 2
              expect(val.body.length).to.equal(i - 3);

              cb();
              return;
            });

          else if (ival === 6) {
            // Expect to takes and propegate error from sink
            expect(pval.body).to.deep.equal({
              error: true,
              reasons: ['9081 cannot accept sum equal to 13']
            });

            cb();
            return;
          }

          else
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

  it('runs a reduce transform and stores its inputs and outputs', (done) => {

    // Create a test Web app
    const app = webapp();

    // Create a schema for our test docs, representing pairs of numbers
    const Nb = {
      validate: (doc) => doc
    };

    // Define a test reduce transform that accumulates the sum of 
    // numbers
    const xLessThanSeven = function *(accums, docs, auth) {
      return rest(reduce(docs, (log, doc) => {
        const res = extend({
          t: doc.t,
          x: doc.x
        }, doc.x > 6 ? {
          error: true,
          reasons: ['x is not less than 7']
        } : {
          val: last(log)[0].val + doc.x
        })
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
    const erscope = (doc) => undefined;
    const okeys = (doc) => igroups(doc);
    const otimes = (doc) => [doc.t];

    // Add a dataflow reducer middleware to our test app
    const reducer = dataflow.reducer(xLessThanSeven, {
      input: {
        type: 'nb',
        schema: Nb,
        post: '/v1/nbs',
        get: '/v1/nbs/t/:t/k/:kx',
        dbname: 'nbs',
        wscope: iwscope,
        rscope: irscope,
        key: ikey,
        time: itime,
        groups: igroups
      },
      output: {
        type: 'sum',
        get: '/v1/reductions/t/:t/k/:kg',
        dbname: 'reductions',
        rscope: orscope,
        keys: okeys,
        times: otimes
      },
      error: {
        get: '/v1/nbs/t/:t/k/:kx/error',
        dbname: 'nberror',
        rscope: erscope
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
        if(++checks == 9) done();
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
        }, odoc.x === 6 ? {
          body: {
            error: true,
            reasons: ['9081 cannot accept x equal to 6']
          }
        } : {})]]);

        check();
      };

      // Post a set of input docs
      treduce([1, 2, 3, 3, 4, 5, 6, 7, 8], (accum, ival, i, l, cb) => {
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

          expect(pval.statusCode).to.equal(201);

          // Sink returns error
          if(ival === 6) {
            expect(pval.body).to.deep.equal({
              error: true,
              reasons: ['9081 cannot accept x equal to 6']
            });
            cb();
            return;
          }

          // Reduce function returns error
          if(ival > 6)
            request.get(pval.headers.location + '/error', {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body[0], 'id', 'processed', 'nb_id',
                'processed_id')).to.deep.equal(extend({}, idoc, {
                  reasons: ['x is not less than 7'],
                  error: true
                }));
              expect(val.body[0].id).to.match(new RegExp(
                't/00014.*-0-0-0/k/' + idoc.x));
              // 1 error doc when ival = 7 and 2 error docs when ival = 8
              expect(val.body.length).to.equal(ival - 6);
              cb();
              return;
            });

          // Post to error db instead of output and sink. Get error
          else
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
});
