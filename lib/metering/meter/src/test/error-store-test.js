'use strict';

/* eslint no-unused-expressions: 1 */
// const { extend } = require('underscore');
const errorStore = require('../lib/error-store');

describe('Store error docs tests', () => {
  const errorDb = {
    put : sinon.stub(),
    get: sinon.stub()
  };
  const usageDoc = {
    organization_id: 'organization-id',
    space_id: 'space-id',
    consumer_id: 'consumer-id',
    resource_id: 'resource-id',
    plan_id: 'plan-id',
    resource_instance_id: 'resource-instance-id',
    start: 1518698304293
  };

  const id = 't/0001517443200000/k/organization-id/space-id/consumer-id/resource-id/plan-id/resource-instance-id';
  let errorStoreHandler;
  const processErr = { msg: 'Error during plan execution' };
  const expectedDoc = {
    _id: id,
    doc: usageDoc,
    error: processErr
  };

  before(() => {
    errorStoreHandler = errorStore(errorDb);
  });

  context('store a document', () => {

    const processErr = { msg: 'Error during plan execution' };

    beforeEach(async() => {
      errorDb.put.returns(Promise.resolve());
      await errorStoreHandler.store(usageDoc, processErr);
    });

    it('should succeed', () => {

      assert.calledWith(errorDb.put, expectedDoc);
    });
  });

  context('retrieve a document', () => {


    beforeEach(() => {
      errorDb.get.returns(Promise.resolve(expectedDoc));
    });

    it('should succeed', async() => {
      const doc = await errorStoreHandler.get(id);
      assert.calledWith(errorDb.get, id);
      expect(doc).to.deep.equal(expectedDoc);
    });
  });

});

