'use strict';

const createMeter = require('../lib/meter-decorator');

describe('', () => {
  let sandbox;
  let meterFake;
  let meter;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sandbox.restore();
  });
  context('when usage doc sucessfully metered', () => {
    const expectedDoc = { expected: 'doc' };

    beforeEach(() => {
      meterFake = { meterUsage: sandbox.stub().resolves(expectedDoc) };
      meter = createMeter(meterFake);
    });

    it('should return meterd doc', async() => {
      const doc = await meter.meterUsage(sandbox.any);
      expect(doc).to.deep.equal(expectedDoc);
    });
  });

  context('when usage doc unsucessfully metered', () => {
    context('when business error', () => {
      let usageDoc = 'usage-doc';
      let error = { isPlanBusinessError: true };
      let errorDbFake;

      beforeEach(() => {
        meterFake = { meterUsage: sandbox.stub().rejects(error) };
      });

      context('when storing in error DB sucessfully', () => {
        beforeEach(() => {
          errorDbFake = { store: sandbox.stub().resolves() };
          meter = createMeter(meterFake, errorDbFake);
        });

        it('should not throw', async() => {
          await assertPromise.isFulfilled(meter.meterUsage(usageDoc))
            .then(() => assert.calledOnce(errorDbFake.store))
            .then(() => assert.calledWith(errorDbFake.store, usageDoc, error));
        });
      });

      context('when storing in error DB unsucessfully', () => {
        beforeEach(() => {
          errorDbFake = { store: sandbox.stub().rejects() };
          meter = createMeter(meterFake, errorDbFake);
        });

        it('should throw', async() => {
          await assertPromise.isRejected(meter.meterUsage(sandbox.any));
        });
      });
    });

    context('when non business error', () => {
      beforeEach(() => {
        meterFake = { meterUsage: sandbox.stub().rejects() };
        meter = createMeter(meterFake);
      });

      it('should throw', async() => {
        await assertPromise.isRejected(meter.meterUsage(sandbox.any));
      });
    });
  });
});
