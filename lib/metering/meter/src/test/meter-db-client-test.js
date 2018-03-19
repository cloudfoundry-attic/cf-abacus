'use strict';

const createDb = require('../lib/meter-db-client');

describe('Store error docs tests', () => {
  let db;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  let output;
  let dbClientFake;

  context('when successfully storing document', () => {
    const expectedOutput = { id: 'expected-id' };
    const buildKeyId = 'build-key-id';

    let inputDocument;

    beforeEach(async() => {
      dbClientFake = {
        put: sandbox.stub().resolves(expectedOutput),
        buildKey: sandbox.stub().returns(buildKeyId)
      };
      db = createDb(dbClientFake);
    });

    context('with error', () => {
      const usageDoc = 'usage-doc';
      const inputError = 'input-error';

      inputDocument = { _id: buildKeyId, doc: usageDoc, error: inputError };

      beforeEach(async() => {
        output = await db.put(usageDoc, inputError);
      });

      it('should return expected output', () => {
        assert.calledOnce(dbClientFake.buildKey);
        assert.calledWith(dbClientFake.buildKey, usageDoc);
        assert.calledOnce(dbClientFake.put);
        assert.calledWith(dbClientFake.put, inputDocument);
        expect(output).to.deep.equal(expectedOutput);
      });
    });
    // context('without error', () => {
    //   inputDocument = { id: 'id' };
    //   beforeEach(async() => {
    //     output = await errorStoreHandler.store(inputDocument);
    //   });

    //   it('should return expected output', () => {
    //     assert.calledOnce(dbClientStub.put);
    //     assert.calledWith(dbClientStub.put, inputDocument);
    //     assert.calledOnce(dbClientStub.buildKey);
    //     assert.calledWith(dbClientStub.buildKey, inputDocument);
    //     expect(output).to.deep.equal(expectedOutput);
    //   });
    // });
  });

  // context('retrieve a document', () => {

  //   beforeEach(() => {
  //     errorDb.get.resolves(expectedDoc);
  //   });

  //   it('should succeed', async() => {
  //     const doc = await errorStoreHandler.get(id);
  //     assert.calledWith(errorDb.get, id);
  //     expect(doc).to.deep.equal(expectedDoc);
  //   });
  // });
});

