'use strict';

const { Gauge, NopGauge } = require('../lib/gauge');

describe('gauge', () => {
  // const epsilon = 0.001;

  let gauge;

  describe('Gauge', () => {
    const gaugeName = 'gauge-name';
    const startTime = 1531483200000; // 2018-07-13 12:00:00

    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers(startTime);
      gauge = new Gauge(gaugeName);
    });

    afterEach(() => {
      clock.restore();
    });

    it('is possible to get name', () => {
      expect(gauge.name).to.equal(gaugeName);
    });

    it('can have value set', () => {
      gauge.set(13);
      expect(gauge.get()).to.equal(13);
    });

    describe('summary', () => {
      it('returns min, max, and average over last and current minute, if both are present', () => {
        // previous minute
        gauge.set(1);
        clock.tick(30 * 1000);
        gauge.set(3);
        clock.tick(30 * 1000);

        // current minute
        gauge.set(3);
        clock.tick(15 * 1000);
        gauge.set(5);
        clock.tick(15 * 1000);

        expect(gauge.summary()).to.deep.equal({
          min: 1,
          max: 5,
          avg: 3
        });
      });

      it('returns min, max, and average over current minute, if data for previous minute not present', () => {
        // current minute
        gauge.set(3);
        clock.tick(15 * 1000);
        gauge.set(5);
        clock.tick(15 * 1000);

        expect(gauge.summary()).to.deep.equal({
          min: 3,
          max: 5,
          avg: 4
        });
      });

      it('returns min, max, and average over last minute, if data for current minute not present', () => {
        // previous minute
        gauge.set(1);
        clock.tick(30 * 1000);
        gauge.set(3);
        clock.tick(30 * 1000);

        expect(gauge.summary()).to.deep.equal({
          min: 1,
          max: 3,
          avg: 2
        });
      });

      it('returns undefined min, max, and average, if data for current and last minute not present', () => {
        expect(gauge.summary()).to.deep.equal({
          min: undefined,
          max: undefined,
          avg: undefined
        });
      });
    });

    describe('report', () => {
      const describeWindow = (name, opts = {}) => {
        const getPrevious = opts.getPrevious;
        const getCurrent = opts.getCurrent;
        const windowDuration = opts.duration;

        describe(`${name} interval`, () => {
          describe('previous', () => {
            it('returns undefined min, max, average, if no data', () => {
              clock.tick(windowDuration);
              expect(getPrevious()).to.deep.equal({
                min: undefined,
                max: undefined,
                avg: undefined
              });
            });

            it('returns undefined min, max, average, even if there is data for current interval', () => {
              gauge.set(2);
              clock.tick(windowDuration - 1);
              gauge.set(4);
              expect(getPrevious()).to.deep.equal({
                min: undefined,
                max: undefined,
                avg: undefined
              });
            });

            it('returns undefined min, max, average, if we have overshot any old data', () => {
              gauge.set(1);
              clock.tick(2 * windowDuration + 1);
              expect(getPrevious()).to.deep.equal({
                min: undefined,
                max: undefined,
                avg: undefined
              });
            });

            it('returns undefined min, max, average, if we have overshot any old data, regardless of new data', () => {
              gauge.set(1);
              clock.tick(2 * windowDuration + 1);
              gauge.set(1);
              expect(getPrevious()).to.deep.equal({
                min: undefined,
                max: undefined,
                avg: undefined
              });
            });

            it('returns a calculation of min, max, average, if there was data', () => {
              gauge.set(12);
              gauge.set(2);
              clock.tick(windowDuration);
              gauge.set(1);
              expect(getPrevious()).to.deep.equal({
                min: 2,
                max: 12,
                avg: 7
              });
            });
          });

          describe('current', () => {
            it('returns undefined min, max, average, if no data', () => {
              expect(getCurrent()).to.deep.equal({
                min: undefined,
                max: undefined,
                avg: undefined
              });
            });

            it('returns a calculation of min, max, average, if there is data', () => {
              gauge.set(4);
              clock.tick(windowDuration / 4);
              gauge.set(10);
              clock.tick(windowDuration / 4);
              expect(getCurrent()).to.deep.equal({
                min: 4,
                max: 10,
                avg: 7
              });
            });
          });
        });
      };

      describeWindow('second', {
        duration: 1000,
        getPrevious: () => {
          return gauge.report().intervals.previous_second;
        },
        getCurrent: () => {
          return gauge.report().intervals.current_second;
        }
      });

      describeWindow('minute', {
        duration: 60 * 1000,
        getPrevious: () => {
          return gauge.report().intervals.previous_minute;
        },
        getCurrent: () => {
          return gauge.report().intervals.current_minute;
        }
      });

      describeWindow('hour', {
        duration: 60 * 60 * 1000,
        getPrevious: () => {
          return gauge.report().intervals.previous_hour;
        },
        getCurrent: () => {
          return gauge.report().intervals.current_hour;
        }
      });
    });
  });

  describe('NopGauge', () => {
    beforeEach(() => {
      gauge = new NopGauge();
    });

    it('ignores set calls', () => {
      gauge.set(15);
      expect(gauge.get()).equal(0);
    });

    it('returns a dummy summary', () => {
      const summary = gauge.summary();
      expect(summary).to.deep.equal({});
    });

    it('returns a dummy report', () => {
      const report = gauge.report();
      expect(report).to.deep.equal({});
    });
  });
});

