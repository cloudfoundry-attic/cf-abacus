'use strict';

const { extend } = require('underscore');
const createDb = require('../lib/db-client-wrapper');

describe('DB Client Wrapper tests', () => {
  const buildKeyId = 'build-key-id';

  let db;
  let sandbox;
  let output;
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

    const usageDoc = { doc: 'usage-doc' };
    const expectedOutput = { id: 'expected-id' };


    beforeEach(async() => {
      inputDocument = extend({}, usageDoc, { _id: buildKeyId });
      dbClientFake.put.yields(undefined, expectedOutput);
      db = createDb(dbClientFake, buildKeyFnStub);
      output = await db.put(usageDoc);
    });

    it('should return expected output', () => {
      assert.calledOnce(buildKeyFnStub);
      assert.calledWith(buildKeyFnStub, usageDoc);
      assert.calledOnce(dbClientFake.put);
      assert.calledWith(dbClientFake.put, inputDocument);
      expect(output).to.deep.equal(expectedOutput);
    });

  });

  context('when storing a document throws', () => {

    let inputDocument;
    const usageDoc = { doc: 'usage-doc' };
    const expectedErrorMsg = 'Storing in DB fails';

    beforeEach(() => {
      inputDocument = extend({}, usageDoc, { _id: buildKeyId });
      dbClientFake.put.yields(new Error(expectedErrorMsg));
      db = createDb(dbClientFake, buildKeyFnStub);
    });

    it('should return expected output', async() => {
      await assertPromise.isRejected(db.put(usageDoc), expectedErrorMsg);
      assert.calledOnce(buildKeyFnStub);
      assert.calledWith(buildKeyFnStub, usageDoc);
      assert.calledOnce(dbClientFake.put);
      assert.calledWith(dbClientFake.put, inputDocument);
    });

  });


});

