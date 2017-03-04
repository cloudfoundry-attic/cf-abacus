'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

describe('abacus-moment', () => {
  let moment;
  const oneMonthInMilliseconds = 2629746000;
  const timeDriftInterval = 1000;

  beforeEach(() => {
    delete process.env.ABACUS_TIME_OFFSET;
    delete require.cache[require.resolve('../../src/index.js')];
  });

  context('without time change', () => {
    beforeEach(() => {
      moment = require('../../src/index.js');
    });

    it('validate current time', () => {
      const momentNow = moment.utc().valueOf();
      const dateNow = Date.now();
      const diff = dateNow - momentNow;
      expect(diff).to.be.lt(timeDriftInterval);
    });

    it('converts days to YYYYMM format', () => {
      // 17223 days translates to the following date: 26-2-2017
      expect(moment.toYYYYMM(17223)).to.equal(201702);
    });
  });

  context('with time change', () => {
    beforeEach(() => {
      process.env.ABACUS_TIME_OFFSET = oneMonthInMilliseconds;
      moment = require('../../src/index.js');
    });

    it('validate shifted time', () => {
      const momentNow = moment.utc().valueOf();
      const dateNow = Date.now();
      const diff = momentNow - dateNow;
      expect(diff).to.be.gt(oneMonthInMilliseconds - timeDriftInterval);
    });

    it('converts days to YYYYMM format', () => {
      // 17223 days translates to the following date: 26-2-2017
      // we have offset, but we still expect the same month
      expect(moment.toYYYYMM(17223)).to.equal(201702);
    });
  });

});
