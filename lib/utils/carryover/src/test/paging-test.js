'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;

describe('Read carry-over usage with paging', () => {
  const sandbox = sinon.sandbox.create();

  let carryOver;
  let readAllPagesStub;
  let dbclient;
  let statistics;
  let errorFn;

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    // Mock the dbclient module
    dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        readAllPages: readAllPagesStub
      };
    }, dbclient);

    statistics = {
      carryOver: {
        getSuccess    : 0,
        getNotFound   : 0,
        getFailure    : 0,
        removeSuccess : 0,
        removeFailure : 0,
        upsertSuccess : 0,
        upsertFailure : 0,
        processSuccess: 0,
        processFailure: 0,
        pagesRead     : 0
      }
    };
    errorFn = spy();
  });

  afterEach(() => {
    deleteModules();

    sandbox.restore();

    readAllPagesStub = undefined;
    carryOver = undefined;
    dbclient = undefined;
  });

  const dbOpts = {
    startId: 't/0/start',
    endId: 't/10/end',
    pageSize: 2,
    skip: 0
  };

  const dataPage = [ { i: 1 }, { i: 2 } ];

  context('success', () => {
    beforeEach((done) => {
      readAllPagesStub = sinon.stub();
      readAllPagesStub.callsFake((opts, pFn, cb) => {
        pFn(dataPage, (error) => cb(error));
      });

      const processingFnStub = sinon.stub();
      processingFnStub.withArgs(dataPage).yields();

      carryOver = require('..')(statistics, errorFn);
      carryOver.readAllPages(dbOpts, processingFnStub, (error) => {
        expect(error).to.equal(undefined);
        done();
      });
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver).to.deep.equal({
        getSuccess    : 0,
        getNotFound   : 0,
        getFailure    : 0,
        removeSuccess : 0,
        removeFailure : 0,
        upsertSuccess : 0,
        upsertFailure : 0,
        processSuccess: 2,
        processFailure: 0,
        pagesRead     : 1
      });
    });

    it('error function is not called', () => {
      assert.notCalled(errorFn);
    });
  });

  context('failure processing resource', () => {
    beforeEach((done) => {
      readAllPagesStub = sinon.stub();
      readAllPagesStub.callsFake((opts, pFn, cb) => {
        pFn(dataPage, (error) => cb(error));
      });

      const processingFnStub = sinon.stub();
      processingFnStub.withArgs(dataPage).yields('error');

      carryOver = require('..')(statistics, errorFn);
      carryOver.readAllPages(dbOpts, processingFnStub, (error) => {
        expect(error).to.equal('error');
        done();
      });
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver).to.deep.equal({
        getSuccess    : 0,
        getNotFound   : 0,
        getFailure    : 0,
        removeSuccess : 0,
        removeFailure : 0,
        upsertSuccess : 0,
        upsertFailure : 0,
        processSuccess: 0,
        processFailure: 2,
        pagesRead     : 1
      });
    });

    it('error function is called', () => {
      expect(errorFn.callCount).to.equal(1);
      assert.alwaysCalledWith(errorFn,
        util.format('Failed reading usage data from %s to %s ' +
          'with page size %d', dbOpts.startId, dbOpts.endId, dbOpts.pageSize),
        'error', undefined, 'carryOver');
    });
  });

  context('failure reading from DB', () => {
    beforeEach((done) => {
      readAllPagesStub = sinon.stub();
      readAllPagesStub.callsFake((opts, pFn, cb) => {
        cb('error');
      });

      const processingFnStub = sinon.stub();
      processingFnStub.withArgs(dataPage).yields();

      carryOver = require('..')(statistics, errorFn);
      carryOver.readAllPages(dbOpts, processingFnStub, (error) => {
        expect(error).to.equal('error');
        done();
      });
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver).to.deep.equal({
        getSuccess    : 0,
        getNotFound   : 0,
        getFailure    : 0,
        removeSuccess : 0,
        removeFailure : 0,
        upsertSuccess : 0,
        upsertFailure : 0,
        processSuccess: 0,
        processFailure: 0,
        pagesRead     : 0
      });
    });

    it('error function is called', () => {
      expect(errorFn.callCount).to.equal(1);
      assert.alwaysCalledWith(errorFn,
        util.format('Failed reading usage data from %s to %s ' +
          'with page size %d', dbOpts.startId, dbOpts.endId, dbOpts.pageSize),
        'error', undefined, 'carryOver');
    });
  });

  context('when reading pages from DB', () => {
    const timeout = 64;
    let clock;

    beforeEach(() => {
      clock = sandbox.useFakeTimers();
      process.env.BREAKER_TIMEOUT = timeout;
    });

    afterEach(() => {
      clock.restore();
      delete process.env.BREAKER_TIMEOUT;
    });

    it('should not fail when processing time exceeds breaker timeout', () => {
      const cbSpy = sandbox.spy();
      readAllPagesStub = sandbox.stub().callsFake((opts, fn, cb) =>
        setTimeout(() => cb(), 2 * timeout));

      carryOver = require('..')(statistics, errorFn);
      carryOver.readAllPages(dbOpts, () => {}, cbSpy);

      clock.tick(3 * timeout);

      assert.calledOnce(cbSpy);
      assert.calledWithExactly(cbSpy, undefined);
    });
  });
});
