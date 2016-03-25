'use strict';

// Simple auto-reclosing circuit breaker for Node-style calls, inspired by the
// Akka breaker.

const yieldable = require('abacus-yieldable');

/* eslint no-extra-parens: 1 */

const breaker = require('..');

describe('abacus-breaker', () => {
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

  it('can call a regular function taking a callback', () => {
    // Call a regular function with a callback
    const cb = spy();
    const err = new Error('div');
    const div = function div(x, y, cb) {
      return x ? y ? cb(undefined, x / y) : cb(err, undefined) : (() => {
        throw err;
      })();
    };
    const b = breaker(div);
    b(3, 2, cb);
    b(3, 0, cb);
    b(0, 0, cb);

    // Expect the breaker function to contain the name of the wrapped function
    expect(b.fname).to.equal('div');

    // Expect the callback to be passed the normal result or error
    expect(cb.args.length).to.equal(3);
    expect(cb.args).to.deep.equal([
      [undefined, 1.5],
      [err, undefined],
      [err, undefined]
    ]);
  });

  it('can call a generator', (done) => {
    // Call a generator
    let cbs = 0;
    const cb = spy(() => {
      if(++cbs === 3) {
        // Expect the callback to be passed the normal result or error
        expect(cb.args).to.deep.equal([
          [null, 1.5],
          [err, undefined],
          [err, undefined]
        ]);
        done();
      }
    });

    const err = new Error('div');
    const div = function div(x, y, cb) {
      return x ? y ? cb(undefined, x / y) : cb(err, undefined) : (() => {
        throw err;
      })();
    };
    const b = breaker(yieldable(div));
    b(3, 2, cb);
    b(3, 0, cb);
    b(0, 0, cb);

    clock.tick(500);

    // Expect the breaker function to contain the name of the wrapped function
    expect(b.fname).to.equal('div');
  });

  it('can converts all functions in a module', () => {
    // Call a regular function with a callback
    const cb = spy();
    const err = new Error('div');
    const div = function div(x, y, cb) {
      return x ? y ? cb(undefined, x / y) : cb(err, undefined) : (() => {
        throw err;
      })();
    };
    const mod = () => undefined;
    mod.div = div;
    const b = breaker(mod);
    b.div(3, 2, cb);
    b.div(3, 0, cb);
    b.div(0, 0, cb);

    // Expect the breaker function to contain the name of the wrapped function
    expect(b.div.fname).to.equal('mod.div');

    // Expect the callback to be passed the normal result or error
    expect(cb.args.length).to.equal(3);
    expect(cb.args).to.deep.equal([
      [undefined, 1.5],
      [err, undefined],
      [err, undefined]
    ]);
  });

  it('handles function call timeouts', () => {
    // Call function that takes too long to return
    const cb = spy();
    const sum = function sum(x, y, cb) {
      setTimeout(() => {
        cb(undefined, x + y);
      }, 120000);
    };
    const b = breaker(sum);
    b(3, 2, cb);

    // Expect the callback to be passed a timeout error
    clock.tick(60500);
    expect(cb.args.length).to.equal(1);
    const terr = new breaker.TimeoutError('sum', 60000);
    expect(cb.args[0]).to.deep.equal([terr, undefined]);
  });

  it('fails fast after several errors', () => {
    // Call a failing function several times to trip the breaker
    const cb = spy();
    const err = new Error('div2');
    const div2 = function div2(x, y, cb) {
      return y ? cb(undefined, x / y) : cb(err, undefined);
    };
    const b = breaker(div2, undefined, 3, 50, undefined);
    b(1, 0, cb);
    b(2, 0, cb);
    b(3, 0, cb);
    b(4, 0, cb);
    b(5, 0, cb);

    // Expect the callback to be passed a circuit breaker error
    clock.tick(5500);
    expect(cb.args.length).to.equal(5);
    const cerr = new breaker.CircuitBreakerError('div2');
    expect(cb.args).to.deep.equal([
      [err, undefined],
      [err, undefined],
      [err, undefined],
      [cerr, undefined],
      [cerr, undefined]
    ]);
  });

  it('resets after some time then closes', () => {
    // Call a failing function several times to trip the breaker
    const cb = spy();
    const err = new Error('div3');
    const div3 = function div3(x, y, cb) {
      return y ? cb(undefined, x / y) : cb(err, undefined);
    };
    const b = breaker(div3, undefined, 3, 50, undefined);
    b(1, 0, cb);
    b(2, 0, cb);
    b(3, 0, cb);
    b(4, 0, cb);

    // Travel into the future
    clock.tick(6000);

    // Now make a successful call
    b(5, 5, cb);
    b(6, 6, cb);

    // Expect the callback to be passed a circuit breaker error,
    // then be able to get through again, and finally close
    clock.tick(5500);
    expect(cb.args.length).to.equal(6);
    const cerr = new breaker.CircuitBreakerError('div3');
    expect(cb.args).to.deep.equal([
      [err, undefined],
      [err, undefined],
      [err, undefined],
      [cerr, undefined],
      [undefined, 1],
      [undefined, 1]
    ]);
  });

  it('resets after some time then reopens', () => {
    // Call a failing function several times to trip the breaker
    const cb = spy();
    const err = new Error('div4');
    const div4 = function div4(x, y, cb) {
      return y ? cb(undefined, x / y) : cb(err, undefined);
    };
    const b = breaker(div4, undefined, 3, 50, undefined);
    b(1, 0, cb);
    b(2, 0, cb);
    b(3, 0, cb);
    b(4, 0, cb);

    // Travel into the future
    clock.tick(6000);

    // Now make a failing call
    b(5, 0, cb);
    b(6, 6, cb);

    // Expect the callback to be passed a circuit breaker error,
    // then be able to get through again once, then fail fast
    clock.tick(5500);
    expect(cb.args.length).to.equal(6);
    const cerr = new breaker.CircuitBreakerError('div4');
    expect(cb.args).to.deep.equal([
      [err, undefined],
      [err, undefined],
      [err, undefined],
      [cerr, undefined],
      [err, undefined],
      [cerr, undefined]
    ]);
  });
});

