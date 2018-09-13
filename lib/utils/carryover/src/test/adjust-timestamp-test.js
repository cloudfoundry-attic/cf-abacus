'use strict';

/* eslint no-unused-expressions: 1 */

const _ = require('underscore');
const extend = _.extend;

describe('Adjust carry-over usage', () => {
  let dbEnv;
  let sandbox;
  let getStub;
  let carryOver;
  let statistics;
  let errorFn;

  before(() => {
    dbEnv = process.env.DB_URI;
  });

  after(() => {
    process.env.DB_URI = dbEnv;
  });

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  beforeEach(() => {
    deleteModules();
    sandbox = sinon.createSandbox();

    // Mock the dbclient module
    const stubbedClient = sinon.stub();
    getStub = sinon.stub();
    stubbedClient.returns({
      fname: 'test-stub',
      get: getStub
    });
    stubbedClient.dburi = sinon.stub();
    stubbedClient.tkuri = sinon.stub();

    require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = stubbedClient;

    statistics = {
      carryOver: {
        getSuccess: 0,
        getNotFound: 0,
        getFailure: 0,
        removeSuccess: 0,
        removeFailure: 0,
        upsertSuccess: 0,
        upsertFailure: 0,
        readSuccess: 0,
        readFailure: 0,
        docsRead: 0
      }
    };
    errorFn = spy();
  });

  afterEach(() => {
    sandbox.restore();

    getStub = undefined;
    carryOver = undefined;
  });

  const appUsage = {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  };

  const test = (storedDoc, error, guid, expectedDoc, stats, errorFnCalled) => {
    let result;

    beforeEach((done) => {
      getStub.callsArgWith(1, error, storedDoc);
      carryOver = require('..')(statistics, errorFn);
      carryOver.adjustTimestamp(appUsage, guid, (error, doc) => {
        result = { error, doc };
        done();
      });
    });

    it('returns the expected document', () => {
      expect(result.error).to.equal(error);
      expect(result.doc).to.deep.equal(expectedDoc);
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver).to.deep.equal(
        extend(
          {
            getSuccess: 0,
            getNotFound: 0,
            getFailure: 0,
            removeSuccess: 0,
            removeFailure: 0,
            upsertSuccess: 0,
            upsertFailure: 0,
            readSuccess: 0,
            readFailure: 0,
            docsRead: 0
          },
          stats
        )
      );
    });

    it(`error function is${errorFnCalled ? '' : ' not'} called`, () => {
      if (errorFnCalled) assert.calledOnce(errorFn);
      else assert.notCalled(errorFn);
    });
  };

  context('when adjusting new doc', () => {
    test(undefined, undefined, undefined, appUsage, { getNotFound: 1 }, false);
  });

  context('when db returns error', () => {
    const error = {
      error: 'error',
      noretry: true // Do not retry on this test error to speed up testing
    };

    test(undefined, error, undefined, undefined, { getFailure: 1 }, true);
  });

  context('with document with the same timestamp', () => {
    const storedDoc = {
      _id: 123,
      collector_id: 123,
      state: 'STARTED',
      timestamp: appUsage.start
    };
    const expectedDoc = extend({}, appUsage, {
      start: appUsage.start + 1,
      end: appUsage.end + 1
    });

    test(storedDoc, undefined, undefined, expectedDoc, { getSuccess: 1 }, false);
  });

  context('with older document', () => {
    const storedDoc = {
      _id: 123,
      collector_id: 123,
      state: 'STARTED',
      timestamp: appUsage.start - 10
    };

    test(storedDoc, undefined, undefined, appUsage, { getSuccess: 1 }, false);
  });

  context('if stored document is newer than the current', () => {
    const storedDoc = {
      _id: 123,
      collector_id: 123,
      state: 'STARTED',
      timestamp: appUsage.start + 10
    };
    const expectedDoc = extend({}, appUsage, {
      start: storedDoc.timestamp + 1,
      end: storedDoc.timestamp + 1
    });

    test(storedDoc, undefined, undefined, expectedDoc, { getSuccess: 1 }, false);
  });

  context('if stored document has the same GUID', () => {
    const storedDoc = {
      _id: 123,
      collector_id: 123,
      event_guid: 'old_guid',
      state: 'STARTED',
      timestamp: appUsage.start
    };

    test(storedDoc, undefined, 'old_guid', appUsage, { getSuccess: 1 }, false);
  });

  context('if stored document has only collector_id', () => {
    const storedDoc = {
      _id: 123,
      collector_id: 123
    };

    test(storedDoc, undefined, undefined, appUsage, { getSuccess: 1 }, false);
  });
});
