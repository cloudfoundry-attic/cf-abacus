'use strict';

const moment = require('abacus-moment');
const { Aug } = moment;
const { Sampler } = require('../lib/sampling');

// An important remark on how windows work:
// 
// When going forward (i.e. calculating positive interval/usage),
// the window is determined by:
//    [dimension.start, dimension.end)
//
// As an example, if the dimension is hourly, then following is one
// possible window:
//    [10:00:00, 11:00:00)
// If something is located on the 11:00:00 timestamp, it is not part
// of the window (i.e. dimension.end is excluded)
//
// However, when going backward (i.e. negative correction, negative
// interval/usage), the boundaries of the windows are flipped:
// (This is needed for the worker algorithm to work and progress).
//    (dimension.start, dimension.end]
// 
// As an example, if the dimension is hourly, then here is one
// possible window:
//    (10:00:00, 11:00:00]
// If something is located on the 10:00:00 timestamp, it is not
// part of the 10-th hour window (as strange as it looks), whereas
// the 11:00:00 timestamp is actually part of the 10-th hour window
// and not part of the 11-th hour window.

describe('#calculateNextIntervalEnd', () => {
  let lastIntervalEnd;
  let spanEnd;

  const verifyNextIntervalEnd = (expectedEnd) => {
    const dimension = 'day';
    const sampler = new Sampler(dimension);
    const plannedEnd = sampler.calculateNextIntervalEnd(lastIntervalEnd, spanEnd);
    expect(plannedEnd).to.equal(expectedEnd);
  };

  context('when span end is not yet set', () => {
    beforeEach(() => {
      spanEnd = undefined;
    });

    it('handles when last interval end is inside window', () => {
      lastIntervalEnd = moment.utcTimestamp(2018, Aug, 20, 8, 0, 0, 0);
      verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0));
    });

    it('handles when last interval end is at window start', () => {
      lastIntervalEnd = moment.utcTimestamp(2018, Aug, 20, 0, 0, 0, 0);
      verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0));
    });
  });

  context('when span end is set', () => {
    context('when last interval end equals span end', () => {
      it('returns a noop progression', () => {
        lastIntervalEnd = moment.utcTimestamp(2018, Aug, 20, 8, 0, 0, 0);
        spanEnd = lastIntervalEnd;
        verifyNextIntervalEnd(lastIntervalEnd);
      });
    });

    context('when last interval end is before span end', () => {
      context('when last interval end and span end are in the same window', () => {
        it('handles when both are somewhere within the window', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 6, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 21, 11, 0, 0, 0);
          verifyNextIntervalEnd(spanEnd);
        });

        it('handles when last interval end is at window start', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 21, 11, 0, 0, 0);
          verifyNextIntervalEnd(spanEnd);
        });
      });

      context('when last interval end and span end are in different windows', () => {
        it('handles when last interval end and span end are somewhere within their windows', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 6, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 22, 8, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0));
        });

        it('handles when last interval end is at its window start', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 22, 8, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0));
        });

        it('handles when span end is at its window start', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 6, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0));
        });

        it('handles when both last interval end and span end are at their window starts', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0));
        });

        it('handles when last interval end and span end are separated by a whole window', () => {
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 6, 0, 0, 0);
          spanEnd = moment.utcTimestamp(2018, Aug, 23, 8, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0));
        });
      });
    });

    context('when span end is before last interval end', () => {
      context('when last interval end and span end are in the same window', () => {
        it('handles when both are somewhere within the window', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 21, 5, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 16, 0, 0, 0);
          verifyNextIntervalEnd(spanEnd);
        });

        it('handles when last interval end is at window end', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 21, 5, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0);
          verifyNextIntervalEnd(spanEnd);
        });
      });

      context('when last interval end and span end are in different windows', () => {
        it('handles when last interval end and span end are somewhere within their windows', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 20, 18, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 13, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0));
        });

        it('handles when last interval end is at its window end', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 20, 18, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0));
        });

        it('handles when span end is at its window end', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 21, 13, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0));
        });

        it('handles when both last interval end and span end are at their window ends', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 21, 0, 0, 0, 0));
        });

        it('handles when last interval end and span end are separated by a whole window', () => {
          spanEnd = moment.utcTimestamp(2018, Aug, 20, 18, 0, 0, 0);
          lastIntervalEnd = moment.utcTimestamp(2018, Aug, 22, 13, 0, 0, 0);
          verifyNextIntervalEnd(moment.utcTimestamp(2018, Aug, 22, 0, 0, 0, 0));
        });
      });
    });
  });
});
