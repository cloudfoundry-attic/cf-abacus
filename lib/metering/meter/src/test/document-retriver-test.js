'use strict';

const { extend } = require('underscore');
const createRetriever = require('./../lib/routes/document-retriver');

describe('Test document retriever', () => {

  const expectedDoc = {
    organization_id: 'test-org-id',
    space_id: 'test-space-id',
    resource_id: 'test-resource-id',
    plan_id: 'test-plan-id',
    resource_instance_id: 'test-resource-instance-id',
    measured_usage: []
  };
  const outputDbDoc = extend({}, expectedDoc, { my_field: 'value' });

  let sandbox;
  let outputDbStub;
  let errorDbStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    outputDbStub = {
      get: sandbox.stub()
    };
    errorDbStub = {
      get: sandbox.stub()
    };
  });

  afterEach(() => {
    sandbox.reset();
  });

  context('when document is in output db', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(outputDbDoc);
      retriever = createRetriever(outputDbStub, errorDbStub);
    });

    it('should not call error db', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.notCalled(errorDbStub.get);
    });
  });

  context('when document is in error db', () => {
    const error = { error: 'error' };
    const errorDbDoc = extend({}, expectedDoc, error);
    const newErrorDbDoc = extend({}, expectedDoc, error, { metadata: { retryCount: 1 } });
    let retriever;

    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      errorDbStub.get.resolves(newErrorDbDoc);
      retriever = createRetriever(outputDbStub, errorDbStub);
    });

    it('should call output db and error db', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), errorDbDoc);
      assert.callOrder(outputDbStub.get, errorDbStub.get);
    });
  });

  context('when document is not found', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      errorDbStub.get.resolves(undefined);
      retriever = createRetriever(outputDbStub, errorDbStub);
    });

    it('should return empty document', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), {});
      assert.called(outputDbStub.get);
      assert.called(errorDbStub.get);
    });
  });
});
