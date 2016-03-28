'use strict';

// Small utility that throttles calls to a Node function with callback to a
// maximum number of concurrent calls.

const yieldable = require('abacus-yieldable');

const throttle = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-throttle', () => {
  let clock;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(Date.now(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('throttles concurrent calls to a function with callback', (done) => {
    // Throttle calls to an async function with callback
    const sum = spy((x, y, cb) => setTimeout(() => cb(undefined, x + y), 100));
    const tsum = throttle(sum, 2);

    const cb = () => {
      // Expect 3 calls eventually
      if(sum.args.length === 3) done();
    };

    // Schedule 3 calls to the throttled function
    tsum(1, 2, (err, val) => {
      expect(val).to.equal(3);
      cb();
    });
    tsum(2, 2, (err, val) => {
      expect(val).to.equal(4);
      cb();
    });
    tsum(3, 2, (err, val) => {
      expect(val).to.equal(5);
      cb();
    });

    // Expect only 2 concurrent calls to go through
    expect(sum.args.length).to.equal(2);

    // Let the first two calls complete
    clock.tick(200);

    setImmediate(() => {
      expect(sum.args.length).to.equal(3);

      // Let the third call complete
      clock.tick(200);
    });
  });

  it('reports errors from throttled calls', (done) => {
    // Throttle calls to an async function with callback
    const sum = spy((x, y, cb) => setTimeout(() => cb('err' + (x + y)), 100));
    const tsum = throttle(sum, 2);

    const cb = () => {
      // Expect 3 calls eventually
      if(sum.args.length === 3) done();
    };

    // Schedule 3 calls to the throttled function
    tsum(1, 2, (err, val) => {
      expect(err).to.equal('err3');
      cb();
    });
    tsum(2, 2, (err, val) => {
      expect(err).to.equal('err4');
      cb();
    });
    tsum(3, 2, (err, val) => {
      expect(err).to.equal('err5');
      cb();
    });

    // Expect only 2 concurrent calls to go through
    expect(sum.args.length).to.equal(2);

    // Let the first two calls complete
    clock.tick(200);

    setImmediate(() => {
      expect(sum.args.length).to.equal(3);

      // Let the third call complete
      clock.tick(200);
    });
  });

  it('throttles concurrent calls to a generator', (done) => {
    // Throttle calls to a generator
    const sum = spy((x, y, cb) => setTimeout(() => cb(undefined, x + y), 100));
    const tsum = throttle(yieldable(sum), 2);

    const cb = () => {
      // Expect 3 calls eventually
      if(sum.args.length === 3) done();
    };

    // Schedule 3 calls to the throttled function
    tsum(1, 2, (err, val) => {
      expect(val).to.equal(3);
      cb();
    });
    tsum(2, 2, (err, val) => {
      expect(val).to.equal(4);
      cb();
    });
    tsum(3, 2, (err, val) => {
      expect(val).to.equal(5);
      cb();
    });

    // Expect only 2 concurrent calls to go through
    expect(sum.args.length).to.equal(2);

    // Let the first two calls complete
    clock.tick(200);

    // Let the third call complete
    setImmediate(() => {
      clock.tick(200);
      setImmediate(() => {
        clock.tick(200);
        expect(sum.args.length).to.equal(3);
      });
    });
  });

  it('converts all functions in a module', (done) => {
    // Throttle calls to all functions in a module
    const sum = spy((x, y, cb) => setTimeout(() => cb(undefined, x + y), 100));
    const tmod = throttle({
      sum: sum
    }, 2);

    const cb = () => {
      // Expect 3 calls eventually
      if(sum.args.length === 3) done();
    };

    // Schedule 3 calls to the the throttled function
    tmod.sum(1, 2, (err, val) => {
      expect(val).to.equal(3);
      cb();
    });
    tmod.sum(2, 2, (err, val) => {
      expect(val).to.equal(4);
      cb();
    });
    tmod.sum(3, 2, (err, val) => {
      expect(val).to.equal(5);
      cb();
    });

    // Expect only 2 concurrent calls to go through
    expect(sum.args.length).to.equal(2);

    // Let the first two calls complete
    clock.tick(200);

    setImmediate(() => {
      expect(sum.args.length).to.equal(3);

      // Let the third call complete
      clock.tick(200);
    });
  });
});

