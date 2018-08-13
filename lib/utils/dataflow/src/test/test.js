'use strict';

// Simple and configurable map and reduce dataflow transforms

const uuid = require('uuid');
const { extend, keys, map, omit, pick, times } = require('underscore');

const request = require('abacus-request');
const router = require('abacus-router');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const transform = require('abacus-transform');
const seqid = require('abacus-seqid');
const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');
const moment = require('abacus-moment');

const treduce = transform.reduce;

// Setup debug log
const debug = require('abacus-debug')('abacus-dataflow-test');

// Configure test db URL prefix and sink service URLs
process.env.DB = process.env.DB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

const webapp = require('abacus-webapp');

// Mock the request module
let postspy;
const reqmock = extend({}, request, {
  batch_post: (reqs, cb) => postspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
let validatorspy, authorizespy, cachespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope),
  cache: () => cachespy()
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

require('abacus-audit');
const auditSpy = spy(() => {});
require.cache[require.resolve('abacus-audit')].exports = auditSpy;

const dataflow = require('..');

describe('abacus-dataflow', () => {
  before(() => {
    process.env.CACHE = true;
  });

  beforeEach((done) => {
    validatorspy = spy((req, res, next) => next());
    authorizespy = spy(function() {});
    cachespy = spy(() => {});
    auditSpy.resetHistory();

    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-dataflow-/, done);
  });

  afterEach(() => {
    postspy = undefined;
  });

  it('log input', (done) => {
    const db = dataflow.db('abacus-dataflow-inputlog');
    const logInput = yieldable.functioncb(dataflow.logInput);
    const doc = {
      _id: 'k/key/t/123',
      id: 'k/key/t/123'
    };
    logInput(doc, db, (err) => {
      expect(err).not.to.be.ok;
      // Log with the same input id;
      logInput(doc, db, (err) => {
        expect(err).not.to.be.ok;
        done();
      });
    });
  });

  describe('dataflow reducer', function() {
    // Increase timeout to support slow containers in Concourse and Travis
    this.timeout(5000);

    it('runs a reduce transform and stores its inputs and outputs', (done) => {
      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };

      // Define a test reduce transform that accumulates the sum of
      // numbers
      const sum = function*(accum, udoc) {
        const p = accum[0] || {
          val: 0
        };
        const res = {
          t: udoc.t,
          x: udoc.x,
          val: p.val + udoc.x
        };
        return [res];
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

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 8) done();
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
        expect(odoc.id).to.match(new RegExp('k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
        expect(odoc.nb_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + odoc.x));

        map(keys(oaccum), (group) => {
          try {
            expect(omit(odoc, 'id', 'nb_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
            check();
          } catch (e) {}
        });

        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201
            }
          ]
        ]);

        check();
      };

      // Post a set of input docs
      treduce(
        [1, 2, 3, 3, 4, 5],
        (accum, ival, i, l, cb) => {
          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival
          };

          // Post input doc
          request.post(
            'http://localhost::p/v1/nbs',
            {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              body: idoc
            },
            (err, pval) => {
              expect(err).to.equal(undefined);

              if (i === 3) {
                // Expect a duplicate to be detected
                expect(pval.statusCode).to.equal(409);
                cb();
                return;
              }

              expect(pval.statusCode).to.equal(201);
              // Get the input doc
              request.get(pval.headers.location, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
                expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

                cb();
              });
            }
          );
        },
        {
          even: 0,
          odd: 0
        },
        (err, res) => {
          expect(err).to.equal(undefined);
          check();
        }
      );
    });

    it('save to output db when it gets duplicate (409)', (done) => {
      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };

      // Define a test reduce transform that accumulates the sum of
      // numbers
      const sum = function*(accum, udoc) {
        const p = accum[0] || {
          val: 0
        };
        const res = {
          t: udoc.t,
          x: udoc.x,
          val: p.val + udoc.x
        };
        return [res];
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
          dbname: 'abacus-dataflow-nbs-dups',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-reductions-dups',
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

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 4) done();
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
        expect(odoc.id).to.match(new RegExp('k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
        expect(odoc.nb_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + odoc.x));

        map(keys(oaccum), (group) => {
          try {
            expect(omit(odoc, 'id', 'nb_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
            check();
          } catch (e) {}
        });

        cb(undefined, [
          [
            undefined,
            {
              statusCode: 409
            }
          ]
        ]);

        check();
      };

      // Post a set of input docs
      treduce(
        [1, 2, 3],
        (accum, ival, i, l, cb) => {
          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival
          };

          // Post input doc
          request.post(
            'http://localhost::p/v1/nbs',
            {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              body: idoc
            },
            (err, pval) => {
              expect(err).to.equal(undefined);

              if (i === 3) {
                // Expect a duplicate to be detected
                expect(pval.statusCode).to.equal(409);
                cb();
                return;
              }

              expect(pval.statusCode).to.be.equal(201);

              // Get the input doc
              request.get(pval.headers.location, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
                expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

                cb();
              });
            }
          );
        },
        {
          even: 0,
          odd: 0
        },
        (err, res) => {
          expect(err).to.equal(undefined);

          // Verify all docs are stored in the output DB
          dataflow.replay(reducer, 1000, (err, vals) => {
            expect(err).to.equal(undefined);
            expect(vals).to.deep.equal({
              replayed: 0,
              failed: 0
            });
            check();
          });
        }
      );
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
      const sum = function*(accum, udoc) {
        const p = accum[0] || {
          val: 0
        };
        const res = {
          t: udoc.t,
          x: udoc.x,
          val: p.val + udoc.x
        };
        return [res];
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

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 8) done();
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
        expect(odoc.id).to.match(new RegExp('k/' + igroups(odoc).join('/') + '/t/[0-9].*'));
        expect(odoc.nb_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + odoc.x));

        map(keys(oaccum), (group) => {
          try {
            expect(omit(odoc, 'id', 'nb_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
            check();
          } catch (e) {}
        });

        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201
            }
          ]
        ]);

        check();
      };

      // Post a set of input docs
      treduce(
        [1, 2, 3, 3, 4, 5],
        (accum, ival, i, l, cb) => {
          // The test input doc
          const idoc = {
            t: t0 + ival,
            x: ival
          };

          // Post input doc
          request.post(
            'http://localhost::p/v1/nbs',
            {
              p: server.address().port,
              auth: {
                bearer: 'test'
              },
              body: idoc
            },
            (err, pval) => {
              expect(err).to.equal(undefined);

              if (i === 3) {
                // Expect a duplicate to be detected
                expect(pval.statusCode).to.equal(409);
                cb();
                return;
              }

              expect(pval.statusCode).to.equal(201);

              // Get the input doc
              request.get(pval.headers.location, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
                expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

                cb();
              });
            }
          );
        },
        {
          even: 0,
          odd: 0
        },
        (err, res) => {
          expect(err).to.equal(undefined);
          check();
        }
      );
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
      const bigSum = function*(accum, udoc) {
        if (udoc.x < 7)
          return [
            extend(
              {
                t: udoc.t,
                x: udoc.x
              },
              {
                error: 'exsmallerthanseven',
                reason: 'X is smaller than seven.'
              }
            )
          ];

        const p = accum[0] || {
          val: 0
        };
        const res = {
          t: udoc.t,
          x: udoc.x,
          val: p.val + udoc.x
        };
        return [res];
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

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 2) done();
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
        expect(odoc.id).to.match(new RegExp('k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
        expect(odoc.nb_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + odoc.x));

        map(keys(oaccum), (group) => {
          try {
            expect(omit(odoc, 'id', 'nb_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
            check();
          } catch (e) {}
        });

        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201
            }
          ]
        ]);

        check();
      };

      // Post a set of input docs
      treduce([6, 6, 7], (accum, ival, i, l, cb) => {
        // The test input doc
        const idoc = {
          t: t0 + ival,
          x: ival
        };

        const checkInputDocument = (locationHeader, cb) => {
          request.get(locationHeader, {}, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
            expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

            cb();
          });
        };

        // Post input doc
        request.post(
          'http://localhost::p/v1/nbs',
          {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          },
          (err, pval) => {
            if (ival < 7) {
              expect(pval).to.equal(undefined);
              expect(err.message).to.equal('exsmallerthanseven');
              expect(err.statusCode).to.equal(500);
              checkInputDocument(err.headers.location, cb);
            } else {
              expect(err).to.equal(undefined);
              expect(pval.statusCode).to.equal(201);
              checkInputDocument(pval.headers.location, cb);
            }
          }
        );
      },
      {
        even: 0,
        odd: 0
      },
      (err, res) => {
        expect(err).to.equal(undefined);
        check();
      });
    });

    context('on business error', () => {
      const t0 = 1443650828616;
      const iwscope = (doc) => undefined;
      const irscope = (doc) => undefined;
      const ikey = (doc) => '' + doc.x;
      const itime = (doc) => seqid();
      const igroups = (doc) => [doc.x];
      const okeys = (doc) => igroups(doc);
      const otimes = (doc) => [doc.t];
      const idoc = {
        t: t0,
        x: 5
      };
      const post = (cb) => request.post(
        'http://localhost::p/v1/nbs',
        {
          p: server.address().port,
          auth: {
            bearer: 'test'
          },
          body: idoc
        },
        (err, pval) => cb(err, pval)
      );

      let server;
      let createError;

      beforeEach(() => {
        const app = webapp();

        const throwError = function*(accum, udoc) {
          throw createError();
        };

        const reducer = dataflow.reducer(throwError, {
          input: {
            type: 'nb',
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
            keys: okeys,
            times: otimes
          },
          sink: {}
        });

        app.use(reducer);

        app.use(router.batch(app));
        server = app.listen(0);
      });

      it('returns correct status code when timeout error occurs', (done) => {
        const timeoutError = extend({}, new Error('Timeout error'), { timeoutError: true });
        createError = () => timeoutError;
        post((err, resp) => {
          expect(resp).to.equal(undefined);
          expect(pick(err, 'statusCode')).to.deep.equal({ statusCode: 500 });
          done();
        });
      });

      it('returns correct status code when plan bussines error occurs', (done) => {
        const planError = extend({}, new Error('Plan error'), { expressionError: true });
        createError = () => planError;
        post((err, resp) => {
          expect(err).to.equal(undefined);
          expect(resp.body).to.deep.equal(planError);
          expect(resp.statusCode).to.equal(422);
          done();
        });
      });

      it('returns correct status code when reducer fn throws error with status code 422', (done) => {
        const NaNError = extend({}, new Error('Plan error'), { status: 422 });
        createError = () => NaNError;
        post((err, resp) => {
          expect(err).to.equal(undefined);
          expect(resp.body).to.deep.equal(NaNError);
          expect(resp.statusCode).to.equal(422);
          done();
        });
      });

      it('returns default error status code when some error occurs', (done) => {
        const playedError = extend({}, new Error('some error'), { any: 'any' });
        createError = () => playedError;
        post((err, resp) => {
          expect(resp).to.equal(undefined);
          expect(pick(err, 'statusCode')).to.deep.equal({ statusCode: 500 });
          done();
        });
      });

    });

    it('detects error when there is no sink', (done) => {
      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };

      // Define a test reduce transform that accumulates the sum of
      // numbers
      const bigSum = function*(accum, udoc) {
        if (udoc.x < 7)
          return [
            extend(
              {
                t: udoc.t,
                x: udoc.x
              },
              {
                error: 'exsmallerthanseven',
                reason: 'X is smaller than seven.'
              }
            )
          ];

        const p = accum[0] || {
          val: 0
        };
        const res = {
          t: udoc.t,
          x: udoc.x,
          val: p.val + udoc.x
        };
        return [res];
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
          dbname: 'abacus-dataflow-nosink-nbs',
          wscope: iwscope,
          rscope: irscope,
          key: ikey,
          time: itime,
          groups: igroups
        },
        output: {
          type: 'sum',
          get: '/v1/reductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-nosink-reductions',
          rscope: orscope,
          keys: okeys,
          times: otimes
        },
        sink: {}
      });
      app.use(reducer);

      app.use(router.batch(app));

      // Listen on an ephemeral port
      const server = app.listen(0);

      postspy = (reqs, cb) => {
        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201
            }
          ]
        ]);
      };

      // Post a set of input docs
      treduce([6, 6, 7], (accum, ival, i, l, cb) => {
        // The test input doc
        const idoc = {
          t: t0 + ival,
          x: ival
        };

        const checkInputDocument = (locationHeader, cb) => {
          request.get(locationHeader, {}, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
            expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

            cb();
          });
        };

          // Post input doc
        request.post(
          'http://localhost::p/v1/nbs',
          {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          },
          (err, pval) => {

            if (ival < 7) {
              expect(pval).to.equal(undefined);
              expect(err.message).to.equal('exsmallerthanseven');
              expect(err.statusCode).to.equal(500);
              checkInputDocument(err.headers.location, cb);
            } else {
              expect(err).to.equal(undefined);
              expect(pval.statusCode).to.equal(201);
              checkInputDocument(pval.headers.location, cb);
            }
          }
        );
      },
      {
        even: 0,
        odd: 0
      },
      (err, res) => {
        expect(err).to.equal(undefined);

        dataflow.replay(reducer, 1000, (err, vals) => {
          expect(err).to.equal(undefined);
          // expect all errors to fail
          expect(vals).to.deep.equal({
            replayed: 0,
            failed: 2
          });

          done();
        });
      });
    });

    it('propagates reducer error from the sink and does not store to output', (done) => {
      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Nb = {
        validate: (doc) => doc
      };

      // Define a test reduce transform that accumulates the sum of
      // numbers
      const bigSum = function*(accum, udoc) {
        const p = accum[0] || {
          val: 0
        };
        const res = {
          t: udoc.t,
          x: udoc.x,
          val: p.val + udoc.x
        };
        return [res];
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

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 5) done();
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
        expect(odoc.id).to.match(new RegExp('k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
        expect(odoc.nb_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + odoc.x));

        map(keys(oaccum), (group) => {
          try {
            expect(omit(odoc, 'id', 'nb_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
            check();
          } catch (e) {}
        });

        cb(undefined, [
          [
            undefined,
            extend({ statusCode: 201 },
              odoc.x === 9
                ? { body: { error: 'enine', reason: 'localhost:9881 doesn\'t like x = 9.' } }
                : {}
            )
          ]
        ]);

        check();
      };

      // Post a set of input docs
      treduce([8, 9, 10], (accum, ival, i, l, cb) => {
        // The test input doc
        const idoc = {
          t: t0 + ival + i,
          x: ival
        };

        const checkInputDocument = (locationHeader, cb) => {
          request.get(locationHeader, {}, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
            expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

            cb();
          });
        };

        // Post input doc
        request.post(
          'http://localhost::p/v1/nbs',
          {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          },
          (err, pval) => {
            if (ival === 9) {
              expect(pval).to.equal(undefined);
              expect(err.message).to.equal('esink');
              expect(err.statusCode).to.equal(500);
              checkInputDocument(err.headers.location, cb);
            } else {
              expect(err).to.equal(undefined);
              expect(pval.statusCode).to.equal(201);
              checkInputDocument(pval.headers.location, cb);
            }
          }
        );
      },
      {
        even: 0,
        odd: 0
      },
      (err, res) => {
        expect(err).to.equal(undefined);
        check();
      });
    });

    it('does batch post, and gather the errors', (done) => {
      // Create a test Web app
      const app = webapp();

      // Create a schema for our test docs, representing pairs of numbers
      const Multi = {
        validate: (doc) => doc
      };

      const multiDoc = function*(accum, udoc) {
        const p = accum[0] || {
          val: 0
        };
        return [
          {
            t: udoc.t,
            x: udoc.x,
            val: p.val + udoc.x
          },
          {
            t: udoc.t,
            x: udoc.x + 1,
            val: p.val + udoc.x + 1
          },
          {
            t: udoc.t,
            x: udoc.x + 2,
            val: p.val + udoc.x + 2
          }
        ];
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

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 2) done();
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
        while (i < reqs.length) {
          expect(reqs[i][0]).to.equal('http://localhost:9081' + '/v2/reductions');

          const val = reqs[i][1];

          expect(val.headers).to.deep.equal({
            authorization: 'Bearer authentication'
          });
          // Check for the expected output docs
          const odoc = val.body;
          expect(odoc.id).to.match(new RegExp('k/' + [igroups(odoc)[i]].join('/') + '/t/' + dbclient.pad16(odoc.t)));
          expect(odoc.multi_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + (odoc.x - i)));

          map(keys(oaccum), (group) => {
            try {
              expect(omit(odoc, 'id', 'multi_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
              check();
            } catch (e) {}
          });
          i++;
        }

        // Simulate return values of the sink. 2 error, 1 success.
        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201,
              body: {
                error: 'efirstdoc',
                reason: 'test forces first doc to give error'
              }
            }
          ],
          [
            undefined,
            {
              statusCode: 201
            }
          ],
          [
            undefined,
            {
              statusCode: 201,
              body: {
                error: 'ethirddoc',
                reason: 'test forces third doc to give error'
              }
            }
          ]
        ]);

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
        request.post(
          'http://localhost::p/v1/multis',
          {
            p: server.address().port,
            auth: {
              bearer: 'test'
            },
            body: idoc
          },
          (err, pval) => {
            expect(pval).to.equal(undefined);
            expect(err.message).to.equal('esink');
            expect(err.statusCode).to.equal(500);

            // Get the input doc
            request.get(err.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
              expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));
              cb();
            });
          }
        );
      },
      {
        even: 0,
        odd: 0
      },
      (err, res) => {
        expect(err).to.equal(undefined);
        check();
      });
    });

    context('on error', () => {
      const t0 = 1443650828616;
      // Some time after submission to get error
      const t1 = 1443650833616;

      const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];

      let app;
      let reducer;

      beforeEach(() => {
        // Create a test Web app
        app = webapp();

        // Create a schema for our test docs, representing pairs of numbers
        const eNb = {
          validate: (doc) => doc
        };

        // Define a test reduce transform that accumulates the sum of
        // numbers
        const bigSum = function*(accum, udoc) {
          if (udoc.x < 7)
            return [
              extend(
                {
                  t: udoc.t,
                  x: udoc.x
                },
                {
                  error: 'exsmallerthanseven',
                  reason: 'X is smaller than seven.'
                }
              )
            ];

          const p = accum[0] || {
            val: 0
          };
          const res = {
            t: udoc.t,
            x: udoc.x,
            val: p.val + udoc.x
          };
          return [res];
        };

        // Define key, time and group functions
        const iwscope = (doc) => undefined;
        const irscope = (doc) => undefined;
        const ikey = (doc) => '' + doc.x;
        const itime = (doc) => seqid();
        const orscope = (doc) => undefined;
        const okeys = (doc) => igroups(doc);
        const otimes = (doc) => [doc.t];

        const ekey = (doc) => '' + doc.x;
        const etime = (doc) => doc.t;
        const erscope = (doc) => undefined;
        const edscope = () => undefined;

        // Add a dataflow reducer middleware to our test app
        reducer = dataflow.reducer(bigSum, {
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
            get: '/v1/enbs/t/:tstart/:tend/get/error',
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
      });

      const storeErrors = (done) => {
        // Handle callback checks
        let checks = 0;
        const check = () => {
          if (++checks === 2) done();
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
          expect(odoc.id).to.match(new RegExp('k/' + igroups(odoc).join('/') + '/t/' + dbclient.pad16(odoc.t)));
          expect(odoc.enb_id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + odoc.x));

          map(keys(oaccum), (group) => {
            try {
              expect(omit(odoc, 'id', 'enb_id', 'processed', 'processed_id', 't', 'x')).to.deep.equal(oaccum[group]);
              check();
            } catch (e) {}
          });

          cb(undefined, [
            [
              undefined,
              {
                statusCode: 201
              }
            ]
          ]);

          check();
        };

        // Replay any old inputs
        dataflow.replay(reducer, 1000, (err, vals) => {
          expect(err).to.equal(undefined);
          // Expect no input docs with error to be replayed
          expect(vals).to.deep.equal({
            replayed: 0,
            failed: 0
          });

          // Listen on an ephemeral port
          const server = app.listen(0);

          // Post a set of input docs
          treduce([6, 6, 7], (accum, ival, i, l, cb) => {
            // The test input doc
            const idoc = {
              t: t0 + ival,
              x: ival
            };

            const checkInputDocument = (locationHeader, cb) => {
              request.get(locationHeader, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(idoc);
                expect(val.body.id).to.match(new RegExp('t/[0-9].*-0-0-0/k/' + idoc.x));

                cb();
              });
            };

            const checkErrorDocs = (cb) => {
              request.get('http://localhost::p/v1/enbs/t/:tstart/:tend/get/error',
                {
                  p: server.address().port,
                  auth: {
                    bearer: 'test'
                  },
                  tstart: t0,
                  tend: t1
                },
                (err, val) => {
                  expect(err).to.equal(undefined);
                  expect(val.statusCode).to.equal(200);
                  // 6 is submitted twice, but db should have only one
                  // No duplicate error doc
                  expect(val.body.length).to.equal(1);

                  // Expect the input doc to be posted with error and reason
                  expect(omit(val.body[0], 'id', 'processed', 'processed_id')).to.deep.equal(
                    extend(
                      {
                        error: 'exsmallerthanseven',
                        reason: 'X is smaller than seven.'
                      },
                      idoc
                    )
                  );

                  cb();
                }
              );
            };

              // Post input doc
            request.post(
              'http://localhost::p/v1/enbs',
              {
                p: server.address().port,
                auth: {
                  bearer: 'test'
                },
                body: idoc
              },
              (err, pval) => {
                // no error
                if (ival >= 7) {
                  expect(err).to.equal(undefined);
                  expect(pval.statusCode).to.equal(201);
                  checkInputDocument(pval.headers.location, cb);
                } else {
                  // There is error
                  expect(pval).to.equal(undefined);
                  expect(err.message).to.equal('exsmallerthanseven');
                  expect(err.statusCode).to.equal(500);
                  checkInputDocument(err.headers.location, () => checkErrorDocs(cb));
                }
              }
            );
          },
          {
            even: 0,
            odd: 0
          },
          (err, res) => {
            expect(err).to.equal(undefined);
            check();
          });
        });
      };

      it('stores reducer errors to error db', (done) => {
        storeErrors(done);
      });

      it('removes reducer errors docs from db', (done) => {
        storeErrors(() => {
          // Replay any old inputs
          dataflow.replay(reducer, 1000, (err, vals) => {
            expect(err).to.equal(undefined);
            expect(vals).to.deep.equal({
              replayed: 0,
              failed: 0
            });

            // Listen on an ephemeral port
            const server = app.listen(0);

            // Handle callback checks
            let checks = 0;
            const check = () => {
              if (++checks === 2) {
                expect(auditSpy.callCount).to.equal(2);
                done();
              }
            };

            // Get error docs
            request.get('http://localhost::p/v1/enbs/t/:tstart/:tend/get/error',
              {
                p: server.address().port,
                auth: {
                  bearer: 'test'
                },
                tstart: t0,
                tend: '' + t1 + '-0-0-0-0' // anytime after the last error doc
              },
              (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                // Expect the error that were stored from previous run
                expect(val.body.length).to.equal(1);

                request.delete(
                  'http://localhost::p/v1/enbs/t/:t/k/:kx' + '/delete/error',
                  {
                    p: server.address().port,
                    auth: {
                      bearer: 'test'
                    },
                    kx: 1,
                    t: t1
                  },
                  (err, val) => {
                    expect(val.statusCode).to.equal(404);
                    expect(err).to.equal(undefined);
                    check();
                  }
                );

                const edoc = val.body[0];
                request.delete(
                  'http://localhost::p/v1/enbs/t/:t/k/:kx' + '/delete/error',
                  {
                    p: server.address().port,
                    auth: {
                      bearer: 'test'
                    },
                    kx: edoc.x,
                    t: edoc.t
                  },
                  (err, val) => {
                    expect(err).to.equal(undefined);
                    expect(val.statusCode).to.equal(200);
                    expect(omit(val.body, 'rev')).to.deep.equal({
                      ok: true,
                      id: edoc.id
                    });
                    check();
                  }
                );
              }
            );
          });
        });
      });
    });

    it('limits db connections to error db', (done) => {
      // Create a test Web app
      const app = webapp();

      // Add a dataflow reducer middleware to our test app
      const reducer = dataflow.reducer(() => {}, {
        input: {
          type: 'enb',
          post: '/v1/enbs',
          get: '/v1/enbs/t/:t/k/:kx',
          dbname: 'abacus-dataflow-enbs'
        },
        output: {
          type: 'esum',
          get: '/v1/ereductions/t/:t/k/:kg',
          dbname: 'abacus-dataflow-ereductions'
        },
        error: {
          type: 'rlmt',
          get: '/v1/rlmt/t/:tstart/:tend/get/error',
          delete: '/v1/enbs/t/:t/k/:kx/:ky/delete/error',
          dbname: 'abacus-dataflow-rlmt'
        },
        sink: {
          host: 'http://localhost:9081',
          authentication: () => 'Bearer authentication',
          posts: ['/v2/reductions']
        }
      });
      app.use(reducer);

      app.use(router.batch(app));

      postspy = (reqs, cb) => {
        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201
            }
          ]
        ]);
      };

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Try to get error docs starting from beginning of time
      request.get(
        'http://localhost::p/v1/rlmt/' + 't/:tstart/:tend/get/error',
        {
          p: server.address().port,
          tstart: 0,
          tend: moment.now()
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(409);
          expect(val.body.error).to.equal('errlimit');
          done();
        }
      );
    });

    context('with documents missing in the output db', () => {
      let reducer;
      const scopes = {
        resource: ['abacus.usage.resource_id.write'],
        system: ['abacus.usage.write']
      };
      const getDoc = (i) => ({
        id: dbclient.tkuri('s' + i + '/' + (i + 1), moment.now()),
        t: 1443650828617 + i,
        x: i,
        y: i + 1,
        processed_id: '0001488815391973-0-0-0-0-' + i,
        processed: 1488815391973 + i
      });
      const inputDocs = [getDoc(1), getDoc(2), getDoc(3)];

      beforeEach((done) => {
        // Create a schema for our test docs, representing pairs of numbers
        const Nb = {
          validate: (doc) => doc
        };

        // Define a test reduce transform that accumulates the sum of
        // numbers
        const sum = function*(accum, udoc) {
          const p = accum[0] || {
            val: 0
          };
          const res = {
            t: udoc.t,
            x: udoc.x,
            val: p.val + udoc.x
          };
          return [res];
        };

        // Define key, time and group functions
        const iwscope = (doc) => scopes;
        const irscope = (doc) => undefined;
        const ikey = (doc) => '' + doc.x;
        const itime = (doc) => seqid();
        const igroups = (doc) => [doc.x % 2 ? 'odd' : 'even'];
        const orscope = (doc) => undefined;
        const okeys = (doc) => igroups(doc);
        const otimes = (doc) => [doc.t];
        const skeys = (doc) => igroups(doc);
        const stimes = (doc) => [doc.t];
        const token = () => 'Bearer authentication';

        // Add a dataflow reducer middleware to our test app
        const opts = {
          input: {
            type: 'nb',
            schema: Nb,
            post: '/v1/reducereplay',
            get: '/v1/reducereplay/t/:t/k/:kx',
            dbname: 'abacus-dataflow-reducereplay',
            wscope: iwscope,
            rscope: irscope,
            key: ikey,
            time: itime,
            groups: igroups,
            authentication: token
          },
          output: {
            type: 'sum',
            get: '/v1/reduceoutplay/t/:t/k/:kx/:ky',
            dbname: 'abacus-dataflow-reduceoutplay',
            rscope: orscope,
            keys: okeys,
            times: otimes
          },
          sink: {
            host: 'http://localhost:9081',
            posts: ['/v2/reduceoutplay'],
            keys: skeys,
            times: stimes,
            authentication: token
          }
        };
        reducer = dataflow.reducer(sum, opts);

        postspy = (reqs, cb) => {
          const outputDoc = reqs[0][1].body;
          cb(undefined, [
            [
              undefined,
              outputDoc.x === 2
                ? { statusCode: 401 }
                : { statusCode: 201 }
            ]
          ]);
        };

        // Store 3 documents in the input DB
        // The second doc will fail to replay
        const db = dataflow.db(opts.input.dbname);
        const logInput = yieldable.functioncb(dataflow.logInput);
        treduce(
          inputDocs,
          (accum, ival, i, l, cb) => {
            logInput(ival, db, (err) => {
              expect(err).to.equal(null);
              cb();
            });
          },
          {},
          (err, res) => {
            expect(err).to.equal(undefined);
            done();
          }
        );
      });

      it('replays data', (done) => {
        authorizespy = spy(function() {
          throw new Error('Unauthorized');
        });

        dataflow.replay(reducer, 3600000, (err, docs) => {
          expect(err).to.equal(undefined, 'Unexpected error ' + err);
          expect(docs).to.deep.equal({
            replayed: 2,
            failed: 1
          });

          authorizespy.alwaysCalledWithExactly(undefined, scopes);

          done();
        });
      });
    });
  });

  /* eslint no-unused-expressions: 1 */
  describe('dataflow sink', () => {
    const localsink = 'http://localhost:1000';
    const remotesink = 'http://abacus.example.org';

    it('returns correct URI', () => {
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

    const distribute = (keys, expectFn, done) => {
      const counts = {};

      const numPartitions = 6;
      const idealDistKeys = keys.length / numPartitions;
      const errorPercentage = 25;

      map(keys, (k) => {
        yieldable.functioncb(dataflow.sink)(k, remotesink, numPartitions, (err, uri) => {
          expect(err).not.to.ok;
          counts[uri] = (counts[uri] || 0) + 1;

          let sum = 0;
          for (let key of Object.keys(counts)) sum += counts[key];

          if (sum === keys.length) {
            debug(
              '%d keys distributed in %j; max error %d %%; ' + 'Distribution distance:',
              keys.length,
              counts,
              errorPercentage
            );
            // Expect keysInPartition +- errorPercentage keys
            // in each partition
            map(counts, (count) => {
              const distance = (count - idealDistKeys) / idealDistKeys * 100;
              debug(count, ';', distance.toFixed(2) + '%');
              expectFn(count, distance, errorPercentage);
            });
            done();
          }
        });
      });
    };

    it('distributes sampled db data evenly', (done) => {
      const dbsample = require('../../src/test/keys.json');
      const keys = map(dbsample, (sample) => sample._id);
      const expectFn = (count, distance, errorPercentage) => {
        expect(Math.abs(distance)).to.be.below(errorPercentage);
      };

      distribute(keys, expectFn, done);
    });

    it('organization sticks to a node', (done) => {
      const keys = [];
      const guid = uuid.v4();
      times(1000, () => {
        keys.push('k/' + guid + 't/0001485908721368');
      });
      const expectFn = (count) => {
        expect(count).to.equal(1000);
      };

      distribute(keys, expectFn, done);
    });
  });
});
