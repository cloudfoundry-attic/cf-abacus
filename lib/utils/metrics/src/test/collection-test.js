'use strict';

const { Collection } = require('../lib/collection');

describe('collection', () => {
  const startTime = 1531483200000; // 2018-07-13 12:00:00

  let clock;
  let collection;

  beforeEach(() => {
    clock = sinon.useFakeTimers(startTime);
    collection = new Collection();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('counter', () => {
    const counterName = 'test.counter';

    let counter;

    beforeEach(() => {
      counter = collection.counter(counterName);
    });

    it('same name returns the same counter', () => {
      const newCounter = collection.counter(counterName);
      expect(newCounter).to.equal(counter);
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
      const getCounterSummary = () => {
        const summary = collection.summary();
        return summary.counters[counterName];
      };

      describe('total', () => {
        const getTotal = () => {
          const summary = getCounterSummary();
          return summary.total;
        };

        it('returns 0 if nothing was incremented', () => {
          expect(getTotal()).to.equal(0);
        });

        it('returns the total count if incremented', () => {
          counter.inc(15);
          expect(getTotal()).to.equal(15);
        });
      });

      describe('last second rate', () => {
        const getLastSecondRate = () => {
          const summary = getCounterSummary();
          return summary.rateLastSec;
        };

        it('returns 0 if nothing was incremented', () => {
          expect(getLastSecondRate()).to.equal(0);
        });

        it('returns 0 if we have not yet entered next second', () => {
          counter.inc(1);
          clock.tick(999);
          counter.inc(1);
          expect(getLastSecondRate()).to.equal(0);
        });

        it('returns 0 if we have overshot any old data', () => {
          counter.inc(1);
          clock.tick(2001);
          expect(getLastSecondRate()).to.equal(0);
        });

        it('returns 0 if we have overshot any old data even if new data', () => {
          counter.inc(1);
          clock.tick(2001);
          counter.inc(1);
          expect(getLastSecondRate()).to.equal(0);
        });

        it('returns last second rate if we are in the next second', () => {
          counter.inc(12);
          clock.tick(1000);
          counter.inc(1);
          expect(getLastSecondRate()).to.equal(12);
        });
      });

      describe('last minute rate', () => {
        const getLastMinuteRate = () => {
          const summary = getCounterSummary();
          return summary.rateLastMin;
        };

        it('returns 0 if nothing was incremented', () => {
          expect(getLastMinuteRate()).to.equal(0);
        });

        it('returns 0 if we have not yet entered next minute', () => {
          counter.inc(1);
          clock.tick(60000 - 1);
          counter.inc(1);
          expect(getLastMinuteRate()).to.equal(0);
        });

        it('returns 0 if we have overshot any old data', () => {
          counter.inc(1);
          clock.tick(120000 + 1);
          expect(getLastMinuteRate()).to.equal(0);
        });

        it('returns 0 if we have overshot any old data even if new data', () => {
          counter.inc(1);
          clock.tick(120000 + 1);
          counter.inc(1);
          expect(getLastMinuteRate()).to.equal(0);
        });

        it('returns last minute rate if we are in the next minute', () => {
          counter.inc(120);
          clock.tick(60000);
          counter.inc(1);
          expect(getLastMinuteRate()).to.equal(2); // 120 per 60s = 2 per sec
        });
      });

      describe('last hour rate', () => {
        const getLastHourRate = () => {
          const summary = getCounterSummary();
          return summary.rateLastHour;
        };

        it('returns 0 if nothing was incremented', () => {
          expect(getLastHourRate()).to.equal(0);
        });

        it('returns 0 if we have not yet entered next hour', () => {
          counter.inc(1);
          clock.tick(3600000 - 1);
          counter.inc(1);
          expect(getLastHourRate()).to.equal(0);
        });

        it('returns 0 if we have overshot any old data', () => {
          counter.inc(1);
          clock.tick(7200000 + 1);
          expect(getLastHourRate()).to.equal(0);
        });

        it('returns 0 if we have overshot any old data even if new data', () => {
          counter.inc(1);
          clock.tick(7200000 + 1);
          counter.inc(1);
          expect(getLastHourRate()).to.equal(0);
        });

        it('returns last hour rate if we are in the next hour', () => {
          counter.inc(7200);
          clock.tick(3600000);
          counter.inc(1);
          expect(getLastHourRate()).to.equal(2); // 7200 per 60min = 2 per sec
        });
      });
    });
  });

  describe('log', () => {
    const logName = 'test.log';

    let log;

    beforeEach(() => {
      log = collection.log(logName);
    });

    it('same name returns the same log', () => {
      const newLog = collection.log(logName);
      expect(newLog).to.equal(log);
    });

    it('has default capacity of 3', () => {
      expect(log.capacity).to.equal(3);
    });

    describe('summary', () => {
      const getLogSummary = () => {
        const summary = collection.summary();
        return summary.logs[logName];
      };

      describe('lines', () => {
        const getLines = () => {
          return getLogSummary().lines;
        };

        it('handles no logs', () => {
          expect(getLines()).to.deep.equal([]);
        });

        it('handles logs below capacity', () => {
          log.write('first');
          expect(getLines()).to.deep.equal([
            'first'
          ]);
        });

        it('handles logs at capacity', () => {
          log.write('first');
          log.write('second');
          log.write('third');
          expect(getLines()).to.deep.equal([
            'first',
            'second',
            'third'
          ]);
        });

        it('handles logs above capacity (by wrapping around)', () => {
          // fill log
          log.write('first');
          log.write('second');
          log.write('third');

          // just in case, fill it again
          log.write('first');
          log.write('second');
          log.write('third');

          // now add a few odd entries
          log.write('new-first');
          log.write('new-second');

          expect(getLines()).to.deep.equal([
            'third',
            'new-first',
            'new-second'
          ]);
        });
      });
    });
  });
});
