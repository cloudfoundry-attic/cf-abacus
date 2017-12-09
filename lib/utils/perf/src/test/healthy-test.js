'use strict';

const moment = require('abacus-moment');

describe('abacus-perf/healty', () => {
  const events = require('abacus-events');
  let now;
  let perf;

  beforeEach(() => {
    now = moment.now();
  });

  afterEach(() => {
    const calls = events.emitter('abacus-perf/calls');
    calls.removeAllListeners('message');
  });

  const reportSuccessBefore = (size, dimenstion) => {
    perf.report('custom.metric', moment.utc(now).subtract(size, dimenstion));
  };

  const reportFailureBefore = (size, dimenstion) => {
    perf.report('custom.metric', moment.utc(now).subtract(size, dimenstion), undefined, new Error());
  };

  context('when providing no count sample', () => {
    it('perf uses default (10 sec) sample', () => {
      delete process.env.PERF_COUNT_SAMPLE;
      delete require.cache[require.resolve('..')];
      perf = require('..');

      reportFailureBefore(11, 'seconds');
      reportSuccessBefore(9, 'seconds');
      reportSuccessBefore(8, 'seconds');
      reportFailureBefore(1, 'seconds');

      expect(perf.healthy(40)).to.equal(true);
    });
  });

  context('when providing count sample', () => {
    const initPerf = (sample) => {
      process.env.PERF_COUNT_SAMPLE = sample;
      delete require.cache[require.resolve('..')];
      perf = require('..');
    };

    const itHealthy = (healthThreshold) => {
      it('healty', () => {
        expect(perf.healthy(healthThreshold)).to.equal(true);
      });
    };

    const itUnhealthy = (healthThreshold) => {
      it('unhealty', () => {
        expect(perf.healthy(healthThreshold)).to.equal(false);
      });
    };

    context('when granularity is seconds', () => {
      beforeEach(() => {
        initPerf('{ "granularity": "seconds", "size": 60 }');

        reportFailureBefore(65, 'seconds');
        reportSuccessBefore(45, 'seconds');
        reportSuccessBefore(45, 'seconds');
        reportFailureBefore(1, 'seconds');
      });

      itHealthy(40);
      itUnhealthy(20);
    });

    context('when granularity is minutes', () => {
      beforeEach(() => {
        initPerf('{ "granularity": "minutes", "size": 60 }');

        reportFailureBefore(65, 'minutes');
        reportSuccessBefore(50, 'minutes');
        reportSuccessBefore(45, 'minutes');
        reportFailureBefore(1, 'seconds');
      });

      itHealthy(40);
      itUnhealthy(20);
    });

    context('when granularity is minutes', () => {
      beforeEach(() => {
        initPerf('{ "granularity": "hours", "size": 24 }');

        reportFailureBefore(25, 'hours');
        reportSuccessBefore(23, 'hours');
        reportSuccessBefore(22, 'hours');
        reportFailureBefore(1, 'seconds');
      });

      itHealthy(40);
      itUnhealthy(20);
    });

    context('when providing invalid granularity', () => {
      it('error is thrown', () => {
        expect(() => initPerf('{ "granularity": "invalid", "size": 60 }')).to.throw();
      });
    });

    context('when providing invalid size', () => {
      it('error is thrown', () => {
        expect(() => initPerf('{ "granularity": "seconds", "size": "invalid" }')).to.throw();
      });
    });
  });
});
