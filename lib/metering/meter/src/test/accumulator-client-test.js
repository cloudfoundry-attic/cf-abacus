'use strict';

/* eslint no-unused-expressions: 1 */

const httpStatus = require('http-status-codes');
// const { extend } = require('underscore');
const AccumulatorClient = require('../lib/accumulator-client');

describe('Accumulator client tests', () => {
  const rootUrl = 'http://url.com';

  let sandbox;
  let postClientStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    postClientStub = {
      post: sandbox.stub()
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
      const auth = 'token';
      // const oauthToken = () => token;

      beforeEach(() => {
        accumulatorClient = new AccumulatorClient(rootUrl, postClientStub, auth);
      });

      context('when accumulator responds with no error', () => {
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.CREATED });
        });

        it('the accumulator is called with correct parameters', async() => {
          await accumulatorClient.postUsage(usageDoc);
          assert.calledWith(postClientStub.post,`${rootUrl}/v1/metering/metered/usage`, {
            headers: {
              authorization: auth
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

      context('when accumulator responds with duplicate error', () => {
        beforeEach(() => {
          postClientStub.post.resolves({ statusCode: httpStatus.CONFLICT });
        });

        it('should return', async() => {
          await assertPromise.isFulfilled(accumulatorClient.postUsage(usageDoc));
        });
      });
    });

    context('when oauthToken is not provided', () => {
      beforeEach(() => {
        accumulatorClient = new AccumulatorClient(rootUrl);
      });

      context('when valid request is made', () => {
        beforeEach(() => {
          postClientStub.post.returns(Promise.resolve({ statusCode: httpStatus.CREATED }));
          accumulatorClient = new AccumulatorClient(rootUrl, postClientStub);
        });

        it('the accumulator is called with correct parameters', async() => {
          await accumulatorClient.postUsage(usageDoc);
          assert.calledWith(postClientStub.post,`${rootUrl}/v1/metering/metered/usage`, {
            body: usageDoc
          });
        });
      });
    });

    context('when no document is provided to post', () => {
      beforeEach(() => {
        accumulatorClient = new AccumulatorClient(rootUrl);
      });

      it('should return', async() => {
        await accumulatorClient.postUsage(undefined);
        assert.notCalled(postClientStub.post);
      });
    });
  });
});

