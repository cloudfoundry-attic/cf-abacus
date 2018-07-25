'use strict';

const { extend } = require('underscore');
const createDb = require('../lib/db-client-wrapper');

describe('DB Client Wrapper tests', () => {
  const buildKeyId = 'build-key-id';
  const inputDoc = { metadata: { retryCount: 0 }, usageDoc: { doc: 'usage-doc' } };

  let db;
  let sandbox;
  let dbClientFake;
  let buildKeyFnStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    dbClientFake = {
      put: sandbox.stub(),
      get: sandbox.stub()
    };
    buildKeyFnStub = sandbox.stub().returns(buildKeyId);
  });

  afterEach(() => {
    sandbox.restore();
  });


  context('when successfully storing a document', () => {
    let inputDocument;

    const expectedOutput = { id: 'expected-id' };

    beforeEach(async() => {
      inputDocument = extend({}, inputDoc, { _id: buildKeyId });
      dbClientFake.put.yields(undefined, expectedOutput);
      db = createDb(dbClientFake, buildKeyFnStub);
      await db.put(inputDoc);
    });

    it('should return expected output', () => {
      assert.calledOnce(buildKeyFnStub);
      assert.calledWith(buildKeyFnStub, inputDoc.usageDoc);
      assert.calledOnce(dbClientFake.put);
      assert.calledWith(dbClientFake.put, inputDocument);
    });
  });

  context('when storing a document throws', () => {
    let inputDocument;

    const expectedErrorMsg = 'Storing in DB fails';

    beforeEach(() => {
      inputDocument = extend({}, inputDoc, { _id: buildKeyId });
      dbClientFake.put.yields(new Error(expectedErrorMsg));
      db = createDb(dbClientFake, buildKeyFnStub);
    });

    it('should return expected output', async() => {
      await assertPromise.isRejected(db.put(inputDoc), expectedErrorMsg);
      assert.calledOnce(buildKeyFnStub);
      assert.calledWith(buildKeyFnStub, inputDoc.usageDoc);
      assert.calledOnce(dbClientFake.put);
      assert.calledWith(dbClientFake.put, inputDocument);
    });

  });

  context('when storing a document throws duplicate error', () => {
    const usageDoc = { doc: 'usage-doc' };

    beforeEach(() => {
      const expectedError = new Error('Storing in DB fails');
      dbClientFake.put.yields(extend(expectedError, { status: 409 }));
      db = createDb(dbClientFake, buildKeyFnStub);
    });

    it('should return expected output', async() => {
      await assertPromise.isFulfilled(db.put(usageDoc));
    });
  });
});

