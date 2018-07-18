'use strict';

const { Counter, NopCounter } = require('../lib/counter');

describe('counter', () => {
  const epsilon = 0.001;

  let counter;

  describe('Counter', () => {
    const counterName = 'counter-name';
    const startTime = 1531483200000; // 2018-07-13 12:00:00

    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers(startTime);
      counter = new Counter(counterName);
    });

    afterEach(() => {
      clock.restore();
    });

    it('is possible to get name', () => {
      expect(counter.name).to.equal(counterName);
    });

    it('can have counter incremented', () => {
      counter.inc();
      expect(counter.get()).to.equal(1);
    });

    it('can have counter incremented by amount', () => {
      counter.inc(3);
      expect(counter.get()).to.equal(3);
    });

    describe('summary', () => {
      it('returns total', () => {
        counter.inc(4);
        counter.inc(5);
        const summary = counter.summary();
        expect(summary.total).to.equal(9);
      });

      it('returns composite rate over last minute and current (ongoing) minute', () => {
        // previous minute
        counter.inc(2);
        clock.tick(30 * 1000);
        counter.inc(2);
        clock.tick(30 * 1000);

        // current minute
        counter.inc(2);
        clock.tick(15 * 1000);
        counter.inc(3);
        clock.tick(15 * 1000);

        // 9 incs per 90 secs = 0.1
        const summary = counter.summary();
        expect(summary.rate).to.be.closeTo(0.1, epsilon);
      });
    });

    describe('report', () => {
      describe('total', () => {
        const getTotal = () => {
          const report = counter.report();
          return report.total;
        };

        it('returns 0 if nothing has been added', () => {
          expect(getTotal()).to.equal(0);
        });

        it('returns the total sum of increments', () => {
          counter.inc(15);
          clock.tick(650000); // irrelevant
          counter.inc(14);
          expect(getTotal()).to.equal(29);
        });
      });

      describe('second interval', () => {
        describe('previous rate', () => {
          const getPreviousRate = () => {
            const report = counter.report();
            return report.intervals.second.previous_rate;
          };

          it('returns 0 if nothing has changed within previous second', () => {
            clock.tick(1000);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 when no data for previous second, even if there is data for current second', () => {
            counter.inc(1);
            clock.tick(1000 - 1);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 if we have overshot any old data', () => {
            counter.inc(1);
            clock.tick(1000 + 1000 + 1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 if we have overshot any old data regardless of new data', () => {
            counter.inc(1);
            clock.tick(1000 + 1000 + 1);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns previous second rate if there is data for it', () => {
            counter.inc(12);
            clock.tick(1000);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(12, epsilon);
          });
        });

        describe('current rate', () => {
          const getCurrentRate = () => {
            const report = counter.report();
            return report.intervals.second.current_rate;
          };

          it('returns 0 if nothing has been incremented', () => {
            expect(getCurrentRate()).to.be.closeTo(0, epsilon);
          });

          it('returns an estimate of the current rate if there is data within current second', () => {
            counter.inc(1);
            clock.tick(250);
            counter.inc(2);
            clock.tick(250);
            // we evaluate it based on the elapsed time of 500 millis, not the full second
            expect(getCurrentRate()).to.be.closeTo(6, epsilon);
          });

          it('returns an estimate of the current rate with fake millisecond if no time has elasped', () => {
            counter.inc(2);
            // we have a delta time of 0 millis and we fake it to 1 millis, preventing division by zero
            expect(getCurrentRate()).to.be.closeTo(2000, epsilon);
          });
        });
      });

      describe('minute interval', () => {
        describe('previous rate', () => {
          const getPreviousRate = () => {
            const report = counter.report();
            return report.intervals.minute.previous_rate;
          };

          it('returns 0 if nothing has changed within previous minute', () => {
            clock.tick(60 * 1000);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 when no data for previous minute, even if there is data for current minute', () => {
            counter.inc(1);
            clock.tick(60 * 1000 - 1);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 if we have overshot any old data', () => {
            counter.inc(1);
            clock.tick(2 * 60 * 1000 + 1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 if we have overshot any old data regardless of new data', () => {
            counter.inc(1);
            clock.tick(2 * 60 * 1000 + 1);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns previous minute rate if there is data for it', () => {
            counter.inc(120);
            clock.tick(60 * 1000);
            counter.inc(1);
            // 120 per 60s = 2 per sec
            expect(getPreviousRate()).to.be.closeTo(2, epsilon);
          });
        });

        describe('current rate', () => {
          const getCurrentRate = () => {
            const report = counter.report();
            return report.intervals.minute.current_rate;
          };

          it('returns 0 if nothing has been incremented', () => {
            expect(getCurrentRate()).to.be.closeTo(0, epsilon);
          });

          it('returns an estimate of the current rate if there is data within current minute', () => {
            counter.inc(1);
            clock.tick(15 * 1000);
            counter.inc(2);
            clock.tick(15 * 1000);
            // we evaluate it based on the elapsed time of 30 seconds, not the full minute
            expect(getCurrentRate()).to.be.closeTo(0.1, epsilon);
          });

          it('returns an estimate of the current rate with fake millisecond if no time has elasped', () => {
            counter.inc(2);
            // we have a delta time of 0 millis and we fake it to 1 millis, preventing division by zero
            expect(getCurrentRate()).to.be.closeTo(2000, epsilon);
          });
        });
      });

      describe('hour', () => {
        describe('previous rate', () => {
          const getPreviousRate = () => {
            const report = counter.report();
            return report.intervals.hour.previous_rate;
          };

          it('returns 0 if nothing has changed within previous hour', () => {
            clock.tick(60 * 60 * 1000);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 when no data for previous hour, even if there is data for current hour', () => {
            counter.inc(1);
            clock.tick(60 * 60 * 1000 - 1);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 if we have overshot any old data', () => {
            counter.inc(1);
            clock.tick(2 * 60 * 60 * 1000 + 1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns 0 if we have overshot any old data regardless of new data', () => {
            counter.inc(1);
            clock.tick(2 * 60 * 60 * 1000 + 1);
            counter.inc(1);
            expect(getPreviousRate()).to.be.closeTo(0, epsilon);
          });

          it('returns previous hour rate if there is data for it', () => {
            counter.inc(360);
            clock.tick(60 * 60 * 1000);
            counter.inc(1);
            // 360 per 60min = 6 per min = 0.1 per sec
            expect(getPreviousRate()).to.be.closeTo(0.1, epsilon);
          });
        });

        describe('current rate', () => {
          const getCurrentRate = () => {
            const report = counter.report();
            return report.intervals.hour.current_rate;
          };

          it('returns 0 if nothing has been incremented', () => {
            expect(getCurrentRate()).to.be.closeTo(0, epsilon);
          });

          it('returns an estimate of the current rate if there is data within current hour', () => {
            counter.inc(1);
            clock.tick(15 * 60 * 1000);
            counter.inc(360);
            clock.tick(15 * 60 * 1000);
            // we evaluate it based on the elapsed time of 30 minutes, not the full hour
            expect(getCurrentRate()).to.be.closeTo(0.2, epsilon);
          });

          it('returns an estimate of the current rate with fake millisecond if no time has elasped', () => {
            counter.inc(2);
            // we have a delta time of 0 millis and we fake it to 1 millis, preventing division by zero
            expect(getCurrentRate()).to.be.closeTo(2000, epsilon);
          });
        });
      });
    });
  });

  describe('NopCounter', () => {
    beforeEach(() => {
      counter = new NopCounter();
    });

    it('ignores increment calls', () => {
      counter.inc();
      counter.inc(13);
      expect(counter.get()).equal(0);
    });

    it('returns a dummy summary', () => {
      const summary = counter.summary();
      expect(summary).to.deep.equal({});
    });

    it('returns a dummy report', () => {
      const report = counter.report();
      expect(report).to.deep.equal({});
    });
  });
});

