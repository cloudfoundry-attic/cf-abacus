'use strict';

// Tiny wrapper around the Node retry module providing call retries with
// exponential backoff.

const yieldable = require('abacus-yieldable');

const retry = require('..');

describe('abacus-retry', () => {
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

  it('retries failed calls to functions with callback', () => {
    // Call a regular function with a callback which fails 2 times then
    // succeeds
    const cb = spy();
    const err = new Error('div');
    let calls = 0;
    const div = function div(x, y, cb) {
      calls++;
      return calls < 3 ? cb(err, undefined) : cb(undefined, x / y);
    };
    const r = retry(div);
    r(3, 2, cb);

    clock.tick(1100);

    // Expect 2 retries after the initial failure then a normal result
    expect(calls).to.equal(1 + 2);
    expect(cb.args.length).to.equal(1);
    expect(cb.args).to.deep.equal([
      [undefined, 1.5]
    ]);
  });

  it('retries failed calls to generators', (done) => {
    // Call a generator which fails 2 times then succeeds
    let calls = 0;

    let cbs = 0;
    const cb = spy(() => {
      if(++cbs === 1) {
        // Expect 2 retries after the initial failure then a normal result
        expect(calls).to.equal(1 + 2);
        expect(cb.args.length).to.equal(1);
        expect(cb.args).to.deep.equal([
          [undefined, 1.5]
        ]);
        done();
      }
    });

    const err = new Error('div');
    const div = function div(x, y, cb) {
      calls++;
      return calls < 3 ? cb(err, undefined) : cb(undefined, x / y);
    };
    const r = retry(yieldable(div));
    r(3, 2, cb);

    clock.tick(1100);
    setImmediate(() => {
      clock.tick(1100);
      setImmediate(() => {
        clock.tick(1100);
      });
    });
  });

  it('converts all functions in a module', () => {
    // Call a regular function with a callback which fails 2 times then
    // succeeds
    const cb = spy();
    const err = new Error('div');
    let calls = 0;
    const div = function div(x, y, cb) {
      calls++;
      return calls < 3 ? cb(err, undefined) : cb(undefined, x / y);
    };
    const mod = {
      div: div
    };
    const r = retry(mod);
    r.div(3, 2, cb);

    clock.tick(1100);

    // Expect 2 retries after the initial failure then a normal result
    expect(calls).to.equal(1 + 2);
    expect(cb.args.length).to.equal(1);
    expect(cb.args).to.deep.equal([
      [undefined, 1.5]
    ]);
  });

  it('returns an error after 5 retries', () => {
    // Call a regular function with a callback which always fails
    const cb = spy();
    const err = new Error('div');
    let calls = 0;
    const div = function div(x, y, cb) {
      calls++;
      cb(err, undefined);
    };
    const r = retry(div);
    r(3, 2, cb);

    clock.tick(2000);

    // Expect 5 retries after the initial failure then an error
    expect(calls).to.equal(1 + 5);
    expect(cb.args.length).to.equal(1);
    expect(cb.args).to.deep.equal([
      [err, undefined]
    ]);
  });

  it('returns an error without retrying', () => {
    // Call a regular function with a callback which always fails
    const cb = spy();
    const err = new Error('div');
    let calls = 0;
    const div = function div(x, y, cb) {
      calls++;
      cb(err, undefined);
    };
    const r = retry(div, 0);
    r(3, 2, cb);

    clock.tick(2000);

    // Expect 5 retries after the initial failure then an error
    expect(calls).to.equal(1);
    expect(cb.args.length).to.equal(1);
    expect(cb.args).to.deep.equal([
      [err, undefined]
    ]);
  });

  it('returns an error marked as noretry', () => {
    // Call a regular function with a callback which always fails
    const cb = spy();
    const err = new Error('div');
    err.noretry = true;
    let calls = 0;
    const div = function div(x, y, cb) {
      calls++;
      cb(err, undefined);
    };
    const r = retry(div, 0);
    r(3, 2, cb);

    clock.tick(2000);

    // Expect 5 retries after the initial failure then an error
    expect(calls).to.equal(1);
    expect(cb.args.length).to.equal(1);
    expect(cb.args).to.deep.equal([
      [err, undefined]
    ]);
  });
});

