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
  const collectorDbDoc = extend({}, expectedDoc, { my_collector_field: 'value' });
  const errorDbDoc = extend({}, expectedDoc, { error: 'error' });
  const outputDbDefaultPartitionerDbDoc = extend({}, expectedDoc, { default_field: 'value' });
  const errorDbDefaultPartitionerDoc = extend({}, expectedDoc, { default_error: 'error' });

  let sandbox;
  let outputDbStub;
  let collectorDbStub;
  let errorDbStub;
  let outputDbDefaultPartitionerStub;
  let errorDbDefaultPartitionerStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    outputDbStub = {
      get: sandbox.stub()
    };
    collectorDbStub = {
      get: sandbox.stub()
    };
    errorDbStub = {
      get: sandbox.stub()
    };
    outputDbDefaultPartitionerStub = {
      get: sandbox.stub()
    };
    errorDbDefaultPartitionerStub = {
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
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should not call error db', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.notCalled(errorDbStub.get);
    });
  });

  context('when document is in output db with non-padded timestamp', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.withArgs('t/0001531893113000/k/abc').resolves(outputDbDoc);
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should not call error db', async() => {
      await assertPromise.becomes(retriever.retrieve('t/1531893113000/k/abc'), expectedDoc);
      assert.notCalled(errorDbStub.get);
    });
  });

  context('when document is in meter output db with default partition', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      outputDbDefaultPartitionerStub.get.resolves(outputDbDefaultPartitionerDbDoc);
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should retrieve the document', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.callOrder(outputDbStub.get, outputDbDefaultPartitionerStub.get);
    });

    it('should not call error db with default partitions', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.notCalled(errorDbDefaultPartitionerStub.get);
    });
  });

  context('when document is in error db with default partition', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      outputDbDefaultPartitionerStub.get.resolves(undefined);
      errorDbDefaultPartitionerStub.get.resolves(errorDbDefaultPartitionerDoc);
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should retrieve the document', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.callOrder(outputDbStub.get, outputDbDefaultPartitionerStub.get, errorDbDefaultPartitionerStub.get);
    });

    it('should not call collector db', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.notCalled(collectorDbStub.get);
    });
  });

  context('when document is in collector db', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      outputDbDefaultPartitionerStub.get.resolves(undefined);
      errorDbDefaultPartitionerStub.get.resolves(undefined);
      collectorDbStub.get.resolves(collectorDbDoc);
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should retrieve the document', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.callOrder(outputDbStub.get, outputDbDefaultPartitionerStub.get, errorDbDefaultPartitionerStub.get,
        collectorDbStub.get);
    });

    it('should not call error db', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), expectedDoc);
      assert.notCalled(errorDbStub.get);
    });
  });

  context('when document is in error db', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      collectorDbStub.get.resolves(undefined);
      outputDbDefaultPartitionerStub.get.resolves(undefined);
      errorDbDefaultPartitionerStub.get.resolves(undefined);
      errorDbStub.get.resolves(errorDbDoc);
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should call output db and error db', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), errorDbDoc);
      assert.callOrder(outputDbStub.get, outputDbDefaultPartitionerStub.get, errorDbDefaultPartitionerStub.get,
        collectorDbStub.get, errorDbStub.get);
    });
  });

  context('when document is not found', () => {
    let retriever;
    beforeEach(() => {
      outputDbStub.get.resolves(undefined);
      collectorDbStub.get.resolves(undefined);
      errorDbStub.get.resolves(undefined);
      retriever = createRetriever(outputDbStub, errorDbStub, collectorDbStub, outputDbDefaultPartitionerStub,
        errorDbDefaultPartitionerStub);
    });

    it('should return empty document', async() => {
      await assertPromise.becomes(retriever.retrieve(sandbox.any), {});
      assert.called(outputDbStub.get);
      assert.called(collectorDbStub.get);
      assert.called(errorDbStub.get);
    });
  });

});
