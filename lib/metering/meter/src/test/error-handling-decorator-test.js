'use strict';

const decoratorFactory = require('../lib/error-handling-decorator');

describe('Decorator factory tests', () => {
  const decorated = {};
  const document = 'document';

  let sandbox;
  let decorator;
  let errorDbFake;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when creating decorator', () => {
    it('should return decorator with expected property', () => {
      const expectedProperty = 'expectedProperty';
      decorator = decoratorFactory(expectedProperty, sandbox.any, sandbox.any);
      expect(decorator).to.have.property(expectedProperty);
    });
  });

  context('when successfully executing decorated function', () => {
    const expectedResult = 'expected-result';

    beforeEach(() => {
      decorated.stub = sandbox.stub().resolves(expectedResult);
      errorDbFake = { store: sandbox.spy() };
      decorator = decoratorFactory('testMethod', decorated.stub, errorDbFake);
    });

    it('returns expeted result', async() => {
      const result = await decorator.testMethod(document);

      assert.calledOnce(decorated.stub);
      assert.notCalled(errorDbFake.store);
      assert.calledWith(decorated.stub, document);
      expect(result).to.be.equal(expectedResult);
    });
  });

  context('when decorated function throws', () => {

    context('business error', () => {
      const expectedError = { isPlanBusinessError: true };
      beforeEach(() => {
        decorated.stub = sandbox.stub().rejects(expectedError);
      });

      context('and successfully stores in errorDB', () => {
        let result;
        beforeEach(async() => {
          errorDbFake = { store: sandbox.stub().resolves() };
          decorator = decoratorFactory('testMethod', decorated.stub, errorDbFake);
          result = await decorator.testMethod(document);
        });

        it('returns undefined', () => {
          expect(result).to.equal(undefined);
          assert.calledOnce(errorDbFake.store);
          assert.calledWith(errorDbFake.store, document, expectedError);
        });
      });

      context('and store in errorDB throws', () => {
        const errorMessage = 'errorDb';
        beforeEach(async() => {
          errorDbFake = { store: sandbox.stub().rejects(new Error(errorMessage)) };
          decorator = decoratorFactory('testMethod', decorated.stub, errorDbFake);
        });

        it('throws expected error', async() => {
          await assertPromise.isRejected(decorator.testMethod(sandbox.any), errorMessage);
        });
      });
    });

    context('non-business error', () => {
      const errorMessage = 'non business error';
      beforeEach(() => {
        decorated.stub = sandbox.stub().rejects(new Error(errorMessage));
        decorator = decoratorFactory('testMethod', decorated.stub, sandbox.any);
      });

      it('throws expected error', async() => {
        await assertPromise.isRejected(decorator.testMethod(sandbox.any), errorMessage);
      });
    });
  });
});
