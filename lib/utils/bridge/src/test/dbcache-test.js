'use strict';

const _ = require('underscore');
const extend = _.extend;
const stubModule = require('./stubber');
const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const abacusDBClientModule = stubModule('abacus-dbclient');
const abacusBatchModule = stubModule('abacus-batch');
const abacusRetryModule = stubModule('abacus-retry');
const abacusBreakerModule = stubModule('abacus-breaker');
const abacusThrottleModule = stubModule('abacus-throttle');

const dbcache = require('../dbcache');

describe('dbcache', () => {
  const sandbox = sinon.sandbox.create();
  const dbConfig = {
    url: 'http://example.org/mongo',
    documentId: 'docId'
  };
  let cache;
  let statistics;
  let dbGetStub;
  let dbPutStub;
  let dbURIStub;

  beforeEach(() => {
    abacusBatchModule.stubMainFunc((fn) => fn);
    abacusRetryModule.stubMainFunc((fn) => fn);
    abacusBreakerModule.stubMainFunc((fn) => fn);
    abacusThrottleModule.stubMainFunc((fn) => fn);

    dbGetStub = sandbox.stub();
    dbPutStub = sandbox.stub();
    dbURIStub = sandbox.stub();
    abacusDBClientModule.stubMainFunc(() => ({
      get: dbGetStub,
      put: dbPutStub
    })).stubProperties({
      dburi: dbURIStub
    });

    statistics = dbcache.createStatistics();
    cache = dbcache(dbConfig, statistics);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('creates the correct uri', () => {
    assert.calledWithExactly(dbURIStub,
      'http://example.org/mongo', 'abacus-cf-bridge');
  });

  context('when unexisting data is read', () => {
    beforeEach(() => {
      dbGetStub.callsFake((id, cb) => {
        cb();
      });
    });

    it('returns undefined', functioncb(function *() {
      const value = yield cache.read();
      expect(value).to.equal(undefined);
    }));
  });

  context('when existing data is read', () => {
    const cacheValue = {
      _id: dbConfig.documentId,
      _rev: 3,
      guid: 'some-guid'
    };

    let readValue;

    beforeEach(functioncb(function *() {
      dbGetStub.callsFake((id, cb) => {
        expect(id).to.equal(dbConfig.documentId);
        cb(undefined, cacheValue);
      });
      readValue = yield cache.read();
    }));

    it('returns stored value', functioncb(function *() {
      expect(readValue).to.equal(cacheValue);
      expect(statistics.failedReads).to.equal(0);
      expect(statistics.successfulReads).to.equal(1);
    }));

    context('when value is written', () => {
      const newCacheValue = {
        guid: 'some-new-guid'
      };
      let writtenDoc;

      beforeEach(functioncb(function *() {
        dbPutStub.onFirstCall().callsFake((doc, cb) => {
          writtenDoc = doc;
          cb(undefined, extend({}, doc, { rev: 4 }));
        });
        yield cache.write(newCacheValue);
      }));

      it('stores correct document (and revision) in db', () => {
        expect(writtenDoc).to.deep.equal({
          _id: dbConfig.documentId,
          _rev: 3,
          guid: newCacheValue.guid
        });
        expect(statistics.failedWrites).to.equal(0);
        expect(statistics.successfulWrites).to.equal(1);
      });

      context('when yet another value is written', () => {
        const newestCacheValue = {
          guid: 'some-last-guid'
        };
        let newestWrittenDoc;

        beforeEach(functioncb(function *() {
          dbPutStub.onSecondCall().callsFake((doc, cb) => {
            newestWrittenDoc = doc;
            cb(undefined, extend({}, doc, { rev: 5 }));
          });

          yield cache.write(newestCacheValue);
        }));

        it('stores correct (and revision) document in db', () => {
          expect(newestWrittenDoc).to.deep.equal({
            _id: dbConfig.documentId,
            _rev: 4,
            guid: newestWrittenDoc.guid
          });
          expect(statistics.failedWrites).to.equal(0);
          expect(statistics.successfulWrites).to.equal(2);
        });
      });
    });
  });

  const assureFails = function *(yieldableFn, ...args) {
    try {
      yield yieldableFn(...args);
      assert.fail('Expected yieldable operation to fail!');
    }
    catch (err) {
      expect(err).to.not.equal(undefined);
    }
  };

  context('when db get fails', () => {
    const dbErr = new Error('failed!');

    beforeEach(() => {
      dbGetStub.callsFake((id, cb) => {
        cb(dbErr, undefined);
      });
    });

    it('read fails and propagates error', functioncb(function *() {
      yield assureFails(cache.read);
      expect(statistics.failedReads).to.equal(1);
      expect(statistics.successfulReads).to.equal(0);
    }));
  });

  context('when db put fails', () => {
    const cacheValue = {
      _id: dbConfig.documentID,
      _rev: 1,
      guid: 'some-guid'
    };
    const dbErr = new Error('failed!');

    beforeEach(() => {
      dbPutStub.callsFake((doc, cb) => {
        cb(dbErr, undefined);
      });
    });

    it('write fails and propagates error', functioncb(function *() {
      yield assureFails(cache.write, cacheValue);
      expect(statistics.failedWrites).to.equal(1);
      expect(statistics.successfulWrites).to.equal(0);
    }));
  });
});
