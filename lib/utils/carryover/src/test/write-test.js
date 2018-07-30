'use strict';

const util = require('util');

const abacusDBClientModule = stubModule('abacus-dbclient');
const abacusBatchModule = stubModule('abacus-batch');
const abacusRetryModule = stubModule('abacus-retry');
const abacusBreakerModule = stubModule('abacus-breaker');
const abacusThrottleModule = stubModule('abacus-throttle');

const createCarryover = require('..');

const guid = 'acc4ff0f';
const state = 'STARTED';

const usageResponse = {
  headers: {
    location: 'https://localhost:8080/v1/metering/collected/usage/t/20161010/k/anonymous'
  }
};

const appUsage = {
  start: 1439897300000,
  end: 1439897300000,
  organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
  space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
  consumer_id: 'app:35c4ff0f',
  resource_id: 'linux-container',
  plan_id: 'standard',
  resource_instance_id: 'memory:35c4ff0f'
};


describe('carryover write tests', () => {
  let carryover;
  let asyncWriteFn;
  let statistics;
  let errorFnStub;
  let dbGetStub;
  let dbPutStub;
  let dbURIStub;
  const sandbox = sinon.sandbox.create();



  beforeEach(() => {
    errorFnStub = sandbox.stub();
    
    abacusBatchModule.stubMainFunc((fn) => fn);
    abacusRetryModule.stubMainFunc((fn) => fn);
    abacusBreakerModule.stubMainFunc((fn) => fn);
    abacusThrottleModule.stubMainFunc((fn) => fn);

    dbGetStub = sandbox.stub();
    dbPutStub = sandbox.stub();
    dbURIStub = sandbox.stub();
    abacusDBClientModule
      .stubMainFunc(() => ({
        get: dbGetStub,
        put: dbPutStub
      }))
      .stubProperties({
        dburi: dbURIStub
      });
    statistics = {
      carryOver: {
        getSuccess: 0,
        getNotFound: 0,
        getFailure: 0,
        removeSuccess: 0,
        removeFailure: 0,
        writeSuccess: 0,
        writeFailure: 0,
        docsRead: 0
      }
    };
  
    carryover = createCarryover(statistics, errorFnStub);
  });

  const failureTests = () => {
    context('when error in reading document occurs', () => {
      const error = new Error();
      let getDocError;

      beforeEach(async() => {
        dbGetStub.yields(error);
        dbPutStub.yields();

        try {
          await asyncWriteFn(appUsage, usageResponse, guid, state);
        } catch (e) {
          getDocError = e;
        }
      });

      it('the document should NOT be inserted', () => {
        assert.notCalled(dbPutStub);
      });

      it('the error should be propageted', () => {
        expect(getDocError).to.equal(error);
      });

      it('the statistics should be updated', () => {
        expect(statistics).to.deep.equal({
          carryOver: {
            getSuccess: 0,
            getNotFound: 0,
            getFailure: 1,
            removeSuccess: 0,
            removeFailure: 0,
            writeSuccess: 0,
            writeFailure: 0,
            docsRead: 0
          }
        });
      });
    });

    context('when error in writing document occurs', () => {
      const error = new Error();
      let upsertError;

      beforeEach(async() => {
        dbGetStub.yields();
        dbPutStub.yields(error);

        try {
          await asyncWriteFn(appUsage, usageResponse, guid, state);
        } catch (e) {
          upsertError = e;
        }
      });

      it('the error should be propageted', () => {
        expect(upsertError).to.equal(error);
      });

      it('the statistics should be updated', () => {
        expect(statistics).to.deep.equal({
          carryOver: {
            getSuccess: 0,
            getNotFound: 1,
            getFailure: 0,
            removeSuccess: 0,
            removeFailure: 0,
            writeSuccess: 0,
            writeFailure: 1,
            docsRead: 0
          }
        });
      });
    });
  };

  describe('carryover upsert tests', () => {
    beforeEach(() => {
      asyncWriteFn = util.promisify(carryover.upsert);
    });

    context('when document already exists', () => {
      const dbDoc = {
        _id: 1,
        _rev: 1
      };

      beforeEach(async() => {
        dbGetStub.yields(undefined, dbDoc);
        dbPutStub.yields();

        await asyncWriteFn(appUsage, usageResponse, guid, state);
      });

      it('the document should be updated', () => {
        assert.calledOnce(dbPutStub);
        assert.calledWith(dbPutStub, {
          _id: 't/0001438387200000/k/e8139b76-e829-4af3-b332-87316b1c0a6c/' 
            + 'a7e44fcd-25bf-4023-8a87-03fba4882995/app:35c4ff0f/linux-container/standard/memory:35c4ff0f',
          _rev: 1,
          collector_id: usageResponse.headers.location,
          event_guid: guid,
          state: state,
          timestamp: appUsage.start
        });
      });

      it('the statistics should be updated', () => {
        expect(statistics).to.deep.equal({
          carryOver: {
            getSuccess: 1,
            getNotFound: 0,
            getFailure: 0,
            removeSuccess: 0,
            removeFailure: 0,
            writeSuccess: 1,
            writeFailure: 0,
            docsRead: 0
          }
        });
      });
    });

    context('when document does not exist', () => {
      beforeEach(async() => {
        dbGetStub.yields();
        dbPutStub.yields();

        await asyncWriteFn(appUsage, usageResponse, guid, state);
      });

      it('the document should be inserted', () => {
        assert.calledOnce(dbPutStub);
        assert.calledWith(dbPutStub, {
          _id: 't/0001438387200000/k/e8139b76-e829-4af3-b332-87316b1c0a6c/' 
            + 'a7e44fcd-25bf-4023-8a87-03fba4882995/app:35c4ff0f/linux-container/standard/memory:35c4ff0f',
          collector_id: usageResponse.headers.location,
          event_guid: guid,
          state: state,
          timestamp: appUsage.start
        });
      });

      it('the statistics should be updated', () => {
        expect(statistics).to.deep.equal({
          carryOver: {
            getSuccess: 0,
            getNotFound: 1,
            getFailure: 0,
            removeSuccess: 0,
            removeFailure: 0,
            writeSuccess: 1,
            writeFailure: 0,
            docsRead: 0
          }
        });
      });
    });

    failureTests();
  });

  describe('carryover insert tests', () => {
    beforeEach(() => {
      asyncWriteFn = util.promisify(carryover.insert);
    });

    context('when document already exists', () => {
      const dbDoc = {
        _id: 1,
        _rev: 1
      };
      let insertError;

      beforeEach(async() => {
        dbGetStub.yields(undefined, dbDoc);
        dbPutStub.yields();

        try {
          await asyncWriteFn(appUsage, usageResponse, guid, state);
        } catch (e) {
          insertError = e;
        }
      });

      it('an error should be returned', () => {
        expect(insertError).to.deep.equal({
          existingDocument: true
        });
      });

      it('no write to db should occur', () => {
        assert.notCalled(dbPutStub);
      });

      it('the statistics should be updated', () => {
        expect(statistics).to.deep.equal({
          carryOver: {
            getSuccess: 1,
            getNotFound: 0,
            getFailure: 0,
            removeSuccess: 0,
            removeFailure: 0,
            writeSuccess: 0,
            writeFailure: 0,
            docsRead: 0
          }
        });
      });
    });

    context('when document does not exist', () => {
      beforeEach(async() => {
        dbGetStub.yields();
        dbPutStub.yields();

        await asyncWriteFn(appUsage, usageResponse, guid, state);
      });

      it('the document should be inserted', () => {
        assert.calledOnce(dbPutStub);
        assert.calledWith(dbPutStub, {
          _id: 't/0001438387200000/k/e8139b76-e829-4af3-b332-87316b1c0a6c/' 
            + 'a7e44fcd-25bf-4023-8a87-03fba4882995/app:35c4ff0f/linux-container/standard/memory:35c4ff0f',
          collector_id: usageResponse.headers.location,
          event_guid: guid,
          state: state,
          timestamp: appUsage.start
        });
      });

      it('the statistics should be updated', () => {
        expect(statistics).to.deep.equal({
          carryOver: {
            getSuccess: 0,
            getNotFound: 1,
            getFailure: 0,
            removeSuccess: 0,
            removeFailure: 0,
            writeSuccess: 1,
            writeFailure: 0,
            docsRead: 0
          }
        });
      });
    });

    failureTests();
  });
});
