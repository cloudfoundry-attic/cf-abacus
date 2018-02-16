'use strict';

/* eslint no-unused-expressions: 1 */

const httpStatus = require('http-status-codes');

const abacusBatchModule = stubModule('abacus-batch');
const abacusRetryModule = stubModule('abacus-retry');
const abacusBreakerModule = stubModule('abacus-breaker');
const abacusRequestModule = stubModule('abacus-request');

describe('Accumulator client tests', () => {
  const rootUrl = 'http://url.com';

  let AccumulatorClient;
  let sandbox;
  let postStub;

  before(() => {
    sandbox = sinon.sandbox.create();
    postStub = sandbox.stub();
    abacusBatchModule.stubMainFunc((fn) => fn);
    abacusRetryModule.stubMainFunc((fn) => fn);
    abacusBreakerModule.stubMainFunc((fn) => fn);

    abacusRequestModule.stubProperties({
      post: postStub
    });

    AccumulatorClient = require('../lib/accumulator-client');
  });

  describe('create accumulator client', () => {
    context('with valid parameters', () => {

      it('should succeed', () => {
        expect(() => new AccumulatorClient(rootUrl)).not.to.throw();
      });
    });

    context('with not valid parameters', () => {

      it('throws error', () => {
        expect(() => new AccumulatorClient()).to.throw();
      });
    });
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
        accumulatorClient = new AccumulatorClient(rootUrl, auth);
      });

      context('when valid request is made', () => {
        beforeEach(() => {
          postStub.yields(undefined, {
            statusCode: httpStatus.CREATED
          });
        });

        it('the accumulator is called with correct parameters', async() => {
          await accumulatorClient.postUsage(usageDoc);
          assert.calledWith(postStub,`${rootUrl}/v1/metering/metered/usage`, {
            headers: {
              authorization: auth
            },
            body: usageDoc
          });
        });
      });

      const itThrowsError = (isBusnessError) => it('an error is thrown', async() => {
        let error;
        try {
          await accumulatorClient.postUsage(usageDoc);
        } catch (e) {
          error = e;
        }
        expect(error.isPlanBusinessError).to.equal(isBusnessError);
        expect(error.message).to.include('Unable to post usage doc to accumulator.');
      });

      context('when accumulator responds with an error', () => {
        beforeEach(async() => {
          postStub.yields(undefined, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR
          });

        });
        itThrowsError(false);
      });

      context('when accumulator responds with business error', () => {
        beforeEach(async() => {
          postStub.yields(undefined, {
            statusCode: httpStatus.UNPROCESSABLE_ENTITY
          });

        });
        itThrowsError(true);
      });
    });

    context('when oauthToken is not provided', () => {
      beforeEach(() => {
        accumulatorClient = new AccumulatorClient(rootUrl);
      });

      context('when valid request is made', () => {
        beforeEach(() => {
          postStub.yields(undefined, {
            statusCode: httpStatus.CREATED
          });
        });

        it('the accumulator is called with correct parameters', async() => {
          await accumulatorClient.postUsage(usageDoc);
          assert.calledWith(postStub,`${rootUrl}/v1/metering/metered/usage`, {
            body: usageDoc
          });
        });
      });
    });

  });
});

