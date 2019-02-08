'use strict';

const httpStatus = require('http-status-codes');
const AccumulatorClient = require('../lib/accumulator-client');

describe('Accumulator client tests', () => {
  const partitionedUrl = 'http://abacus-usage-aggregator-1.cf.sap.hana.ondemand.com';

  let sandbox;
  let urlBuilderStub;
  let postClientStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    postClientStub = {
      post: sandbox.stub()
    };
    urlBuilderStub = {
      getUri: sandbox.stub().resolves(partitionedUrl)
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('postUsage', () => {
    const usageDoc = {
      property: 'value'
    };

    let accumulatorClient;

    context('when oauthToken is provided', () => {
      const token = 'token';

      beforeEach(() => {
        accumulatorClient = new AccumulatorClient(urlBuilderStub, postClientStub, { createHeader: () => token });
      });

      context('when accumulator responds with no error', () => {
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.CREATED });
        });

        it('the accumulator is called with correct parameters', async() => {
          await accumulatorClient.postUsage(usageDoc);
          assert.calledWith(postClientStub.post,`${partitionedUrl}/v1/metering/metered/usage`, {
            headers: {
              authorization: token
            },
            body: usageDoc
          });
        });
      });

      context('when accumulator responds with non duplicate error', () => {
        const expectedErrorBody = 'Error';
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.INTERNAL_SERVER_ERROR , body: expectedErrorBody });
        });

        it('throws expected error', async() => {
          await assertPromise.isRejected(accumulatorClient.postUsage(usageDoc), expectedErrorBody);
        });
      });

      context('when accumulator responds with 422', () => {
        const expectedErrorBody = 'Error';
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.UNPROCESSABLE_ENTITY , body: expectedErrorBody });
        });

        it('throws expected error', async() => {
          await assertPromise.isRejected(accumulatorClient.postUsage(usageDoc), expectedErrorBody);
        });
      });

      context('when accumulator responds with duplicate error', () => {
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.CONFLICT });
        });

        it('should return', async() => {
          await assertPromise.isFulfilled(accumulatorClient.postUsage(usageDoc));
        });
      });

      context('when accumulator responds with out of slack error', () => {
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.CONFLICT, body: { error: 'slack' } });
        });

        it('should throw', async() => {
          await assertPromise.isRejected(accumulatorClient.postUsage(usageDoc));
        });
      });
    });

    context('when oauthToken is not provided', () => {

      context('when valid request is made', () => {
        beforeEach(() => {
          postClientStub.post.returns(Promise.resolve({ statusCode: httpStatus.CREATED }));
          accumulatorClient = new AccumulatorClient(urlBuilderStub, postClientStub);
        });

        it('the accumulator is called with correct parameters', async() => {
          await accumulatorClient.postUsage(usageDoc);
          assert.calledWith(postClientStub.post,`${partitionedUrl}/v1/metering/metered/usage`, {
            body: usageDoc
          });
        });
      });
    });

    context('when no document is provided to post', () => {
      beforeEach(() => {
        accumulatorClient = new AccumulatorClient(urlBuilderStub);
      });

      it('should return', async() => {
        await accumulatorClient.postUsage(undefined);
        assert.notCalled(postClientStub.post);
      });
    });
  });
});

