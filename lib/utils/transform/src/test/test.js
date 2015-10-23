'use strict';

// Simple async map, reduce, and filter data transformation functions with
// callbacks.

const transform = require('..');

describe('abacus-transform', () => {
  it('runs a reduction function asynchronously', () => {

    // Run a reduction function
    const sum = (a, v, i, l, cb) =>
      setImmediate(() => cb(undefined, a + v));
    transform.reduce([1, 2, 3], sum, 0, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(6);
    });

    // Run a reduction function that returns an error
    const err = new Error('Sum error');
    const esum = (a, v, i, l, cb) => setImmediate(() => cb(err, 0));
    transform.reduce([1, 2, 3], esum, 0, (e, val) => {
      expect(e).to.equal(err);
    });

    // Run a reduce function over an empty list
    transform.reduce([], (a, v, i, l, cb) => {
    }, 0, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(0);
    });
  });

  it('runs a map function asynchronously', () => {

    // Run a map function
    const sqr = (v, i, l, cb) => setImmediate(() => cb(undefined, v *
          v));
    transform.map([1, 2, 3], sqr, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([1, 4, 9]);
    });

    // Run a map function that returns an error
    const err = new Error('Sqr error');
    const esqr = (v, i, l, cb) => setImmediate(() => cb(err, 0));
    transform.map([1, 2, 3], esqr, (e, val) => {
      expect(e).to.equal(err);
    });

    // Run a map function over an empty list
    transform.map([], (v, i, l, cb) => {
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([]);
    });
  });

  it('runs a filter function asynchronously', () => {

    // Run a filter function
    const even = (v, i, l, cb) =>
      setImmediate(() => cb(undefined, v % 2 === 0));
    transform.filter([1, 2, 3], even, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([2]);
    });

    // Run a filter function that returns an error
    const err = new Error('Even error');
    const eeven = (v, i, l, cb) => setImmediate(() => cb(err, 0));
    transform.filter([1, 2, 3], eeven, (e, val) => {
      expect(e).to.equal(err);
    });
  });
});

