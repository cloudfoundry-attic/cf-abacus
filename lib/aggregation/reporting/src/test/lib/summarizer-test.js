'use strict';

const summarizer = require('../../lib/summarizer.js');

/* eslint-disable no-unused-expressions */

describe('summarizer', () => {
  const summarizeFnErrMsg = 'SummarizeFn error';

  let sandbox;
  let summaryFunction;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    summaryFunction = sandbox.stub().throws(new Error(summarizeFnErrMsg));
  });

  afterEach(() => {
    sandbox.restore();
    sandbox.reset();
  });

  describe('summarizeWindowElement', () => {
    context('when summary function errors', () => {
      const windowElement = {};

      it('returns summary 0', () => {
        expect(
          summarizer.summarizeWindowElement(
            sandbox.any,
            windowElement,
            summaryFunction,
            sandbox.any,
            sandbox.any
          )
        ).to.deep.equal({
          summary: 0
        });
      });
    });
  });

  describe('summarizeMetric', () => {
    context('when summary function errors', () => {

      let chargePlanMetric;

      beforeEach(() => {
        chargePlanMetric = summarizer.summarizeMetric(sandbox.any, sandbox.any, summaryFunction);
      });

      it('throws', (done) => {
        chargePlanMetric({ metric: 'metric' }, (err) => {
          expect(err).to.exist;
          expect(err.message).to.equal(summarizeFnErrMsg);
          done();
        });
      });
    });
  });

});
