'use strict';

const charger = require('../../lib/charger.js');

/* eslint-disable no-unused-expressions */

describe('charger', () => {
  const chargeFnErrMsg = 'ChargeFn error';

  let sandbox;
  let chargeFunction;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    chargeFunction = sandbox.stub().throws(new Error(chargeFnErrMsg));
  });

  afterEach(() => {
    sandbox.restore();
    sandbox.reset();
  });

  describe('chargeWindowElement', () => {
    context('when charge function errors', () => {
      const windowElement = {};

      it('returns charge 0', () => {
        expect(
          charger.chargeWindowElement(
            sandbox.any,
            windowElement,
            chargeFunction,
            sandbox.any,
            sandbox.any
          )
        ).to.deep.equal({
          charge: 0
        });
      });
    });
  });

  describe('chargeMetric', () => {
    context('when charge function errors', () => {

      let chargePlanMetric;

      beforeEach(() => {
        chargePlanMetric = charger.chargeMetric(sandbox.any, sandbox.any, sandbox.stub(), chargeFunction);
      });

      it('throws', (done) => {
        chargePlanMetric({ metric: 'metric' }, sandbox.any, sandbox.any, (err) => {
          expect(err).to.exist;
          expect(err.message).to.equal(chargeFnErrMsg);
          done();
        });
      });
    });
  });

});
