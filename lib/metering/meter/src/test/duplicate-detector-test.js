'use strict';

// const { extend } = require('underscore');
const DuplicateDetector = require('../lib/duplicate-detector');

describe('detect duplicate ', () => {
  let result;
  let sandbox;
  let hasStub;
  let addStub;
  let detector;
  let dedupeFake;
  let outputDbClientFake;

  const id = 1;
  const usageDoc = { id };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    outputDbClientFake = {
      put: sandbox.stub(),
      get: sandbox.stub(),
      buildId: () => id
    };
    hasStub = sandbox.stub();
    addStub = sandbox.stub();
    dedupeFake = () => ({
      has: hasStub,
      add: addStub
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when posting duplicate messages', () => {
    context('found in cache', () => {
      beforeEach(async() => {
        hasStub.returns(true);
        detector = new DuplicateDetector(outputDbClientFake, dedupeFake);
        result = await detector.isDuplicate(usageDoc);
      });

      it('should return true', () => {
        expect(result).to.equal(true);
        assert.calledOnce(hasStub);
      });
    });

    context('found in output db', () => {
      beforeEach(async () => {
        hasStub.returns(false);
        outputDbClientFake.get.returns(usageDoc);
        detector = new DuplicateDetector(outputDbClientFake, dedupeFake);
        result = await detector.isDuplicate(usageDoc);
      });

      it('should return true', () => {
        expect(result).to.equal(true);
        assert.calledOnce(hasStub);
      });

      it('should add to cache', () => {
        assert.calledOnce(addStub);
        assert.calledWith(addStub, id);
      });
    });
  });

  context('when posting non-duplicate messages', () => {
    beforeEach(async() => {
      hasStub.returns(false);
      outputDbClientFake.get.returns(undefined);
      detector = new DuplicateDetector(outputDbClientFake, dedupeFake);
      result = await detector.isDuplicate(usageDoc);
    });

    it('should return false', async() => {
      expect(result).to.equal(false);
    });
  });
});
