'use strict';

const transform = require('..');

describe('abacus-transform', () => {

  describe('reduce', () => {

    it('calls asynchronous iteratee', (done) => {
      const sumReduce = (memo, value, index, list, cb) =>
        setImmediate(() => cb(undefined, memo + value));

      transform.reduce([1, 2, 3], sumReduce, 0, (err, value) => {
        expect(err).to.equal(undefined);
        expect(value).to.equal(6);
        done();
      });
    });

    it('handles errors in iteratee', (done) => {
      const reduceErr = new Error('Reduce error!');
      const failingReduce = (memo, value, index, list, cb) => 
        setImmediate(() => cb(reduceErr, 0));

      transform.reduce([1, 2, 3], failingReduce, 0, (err, value) => {
        expect(err).to.equal(reduceErr);
        done();
      });
    });

    it('ignores iteratee on empty list', (done) => {
      const noopReduce = (memo, value, index, list, cb) => {
        assert.fail('iteratee should not be called!');
      };

      transform.reduce([], noopReduce, 0, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.equal(0);
        done();
      });
    });

  });

  describe('map', () => {

    it('calls asynchronous iteratee', (done) => {
      const sqrMap = (value, index, list, cb) => 
        setImmediate(() => cb(undefined, value * value));

      transform.map([1, 2, 3], sqrMap, (err, value) => {
        expect(err).to.equal(undefined);
        expect(value).to.deep.equal([1, 4, 9]);
        done();
      });
    });

    it('handles errors in iteratee', (done) => {
      const mapErr = new Error('Map error!');
      const failingMap = (value, index, list, cb) => 
        setImmediate(() => cb(mapErr, 0));

      transform.map([1, 2, 3], failingMap, (err, value) => {
        expect(err).to.equal(mapErr);
        done();
      });
    });

    it('ignores iteratee on empty list', (done) => {
      const noopMap = (value, index, list, cb) => {
        assert.fail('iteratee should not be called!');
      };

      transform.map([], noopMap, (err, value) => {
        expect(err).to.equal(undefined);
        expect(value).to.deep.equal([]);
        done();
      });
    });

  });

  describe('filter', () => {

    it('calls asynchronous iteratee', (done) => {
      const evenFilter = (value, index, list, cb) =>
        setImmediate(() => cb(undefined, value % 2 === 0));

      transform.filter([1, 2, 3, 4], evenFilter, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([2, 4]);
        done();
      });
    });

    it('handles errors in iteratee', (done) => {
      const filterErr = new Error('Filter error!');
      const failingFilter = (value, index, list, cb) => 
        setImmediate(() => cb(filterErr, false));

      transform.filter([1, 2, 3], failingFilter, (err, value) => {
        expect(err).to.equal(filterErr);
        done();
      });
    });

  });

});

