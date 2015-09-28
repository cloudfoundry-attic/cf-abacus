'use strict';

// Small utility that converts Node callback based functions to generators that
// are yieldable from co flow functions.

const co = require('co');
const yieldable = require('..');

/* eslint no-eval: 1 */
/* jshint evil: true */

// Simulate an async IO
const IO = (f, latency) => setTimeout(f, latency);

// Simulate a REST Web service call, take a Javascript expression,
// evaluate it and pass the result to an async callback
const cbget = (expr, cb) => IO(() => cb(undefined, {
  body: {
    result: eval(expr)
  }
}), 5);

describe('abacus-yieldable', () => {
  it('converts callback-based functions to yieldable generators', (done) => {
    // Generator version of our REST Web service call
    const get = yieldable(cbget);

    // Sum function implemented as a generator
    const sum = function *(x, y) {
      return (yield get(x + '+' + y)).body.result;
    };

    // Run the sum generator with co
    co(sum)(3, 2, (err, val) => {
      expect(err).to.equal(null);
      expect(val).to.equal(5);
      done();
    });

    // Return a generator as is
    expect(yieldable(sum)).to.equal(sum);
  });

  it('converts values to thunks', (done) => {
    // Convert a value to a thunk then to a generator
    const unit = yieldable(yieldable.thunk(5));

    // Run the value generator with co
    co(unit)((err, val) => {
      expect(err).to.equal(null);
      expect(val).to.equal(5);
      done();
    });
  });

  it('converts generators to functions with callbacks', (done) => {
    // Generator version of our REST Web service call
    const get = yieldable(cbget);

    // Sum function implemented as a generator
    const sum = function *(x, y) {
      return (yield get(x + '+' + y)).body.result;
    };

    // Convert to a function with callback
    const sumcb = yieldable.functioncb(sum);

    // Run the function with callback
    sumcb(3, 2, (err, val) => {
      expect(err).to.equal(null);
      expect(val).to.equal(5);
      done();
    });
  });

  it('converts promises to functions with callbacks', (done) => {
    // Promise version of our sum function
    const sum = (x, y) => new Promise((resolve, reject) => {
      cbget(x + '+' + y,
        (err, val) => err ? reject(err) : resolve(val.body.result));
    });

    // Convert to a function with callback
    const sumcb = yieldable.functioncb(sum(3, 2));

    // Run the function with callback
    sumcb((err, val) => {
      expect(err).to.equal(null);
      expect(val).to.equal(5);
      done();
    });
  });

  it('converts functions with callbacks to promises', (done) => {
    // Sum function with callback
    const sum = (x, y, cb) => cbget(x + '+' + y,
      (err, val) => err ? cb(err) : cb(null, val.body.result));

    // Convert to a promise
    const psum = yieldable.promise(sum);

    // Run the promise
    psum(3, 2).then((val) => {
      expect(val).to.equal(5);
      done();
    });
  });

  it('converts generators to promises', (done) => {
    // Generator version of our REST Web service call
    const get = yieldable(cbget);

    // Sum function implemented as a generator
    const sum = function *(x, y) {
      return (yield get(x + '+' + y)).body.result;
    };

    // Convert to a promise
    const psum = yieldable.promise(sum);

    // Run the promise
    psum(3, 2).then((val) => {
      expect(val).to.equal(5);
      done();
    });
  });

  it('converts promises to generators', (done) => {
    // Promise version of our sum function
    const psum = (x, y) => new Promise((resolve, reject) => {
      cbget(x + '+' + y,
        (err, val) => err ? reject(err) : resolve(val.body.result));
    });

    // Convert to a generator
    const sum = yieldable(psum(3, 2));

    // Run the sum generator with co
    co(sum)((err, val) => {
      expect(err).to.equal(null);
      expect(val).to.equal(5);
      done();
    });
  });

  it('converts functions in modules', (done) => {
    // Convert a module exporting a function to a module containing a
    // generator-based flow function
    const mod = yieldable({
      unit: yieldable.thunk(5),
      val: 3
    });
    expect(mod.val).to.equal(3);

    // Run the value generator with co
    co(mod.unit)((err, val) => {
      expect(err).to.equal(null);
      expect(val).to.equal(5);
      done();
    });
  });
});

