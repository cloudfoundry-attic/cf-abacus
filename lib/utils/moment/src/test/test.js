'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

describe('abacus-moment', () => {
  let moment;
  const fiveMinutes = 5 * 60 * 1000;
  const timeDriftInterval = 1000;

  const behavesAsExpectedWith = (offset, time) => {
    beforeEach(() => {
      delete process.env.ABACUS_TIME_OFFSET;
      delete require.cache[require.resolve('../../src/index.js')];

      if (offset)
        process.env.ABACUS_TIME_OFFSET = offset;
      moment = require('../../src/index.js');
    });

    it('validate current time', () => {
      const momentNow = moment.utc().valueOf();
      const dateNow = Date.now();
      const diff = momentNow - dateNow;
      expect(diff).to.be.within(time - timeDriftInterval, time + timeDriftInterval);
    });

    it('converts days to YYYYMM format', () => {
      // 17223 days translates to the following date: 26-2-2017
      expect(moment.toYYYYMM(17223)).to.equal(201702);
    });
  };

  context('without time change', () => {
    behavesAsExpectedWith(undefined, 0);
  });

  context('with time change', () => {
    behavesAsExpectedWith(fiveMinutes, fiveMinutes);
  });

  context('with duration', () => {
    behavesAsExpectedWith('{ "minutes": 5, "milliseconds": 1 }', fiveMinutes);
  });

});
