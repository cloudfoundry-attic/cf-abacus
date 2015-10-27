'use strict';

// Deep copies an object/array

const _ = require('underscore');
const omit = _.omit;
const clone = require('..');

describe('abacus-clone', () => {
  it('Creates a deep copy of an object with many objects and arrays', () => {
    // The input object to make a deep copy of
    const original = {
      o: {
        value: 20,
        o: {
          value: 20,
          a: [[20]]
        }
      },
      a: [{
        value: 20,
        a: [{
          value: 20
        }]
      }]
    };

    // The expected object which is the same of the input to compare that
    // the input does not change when the copy is mutated
    const expected = {
      o: {
        value: 20,
        o: {
          value: 20,
          a: [[20]]
        }
      },
      a: [{
        value: 20,
        a: [{
          value: 20
        }]
      }]
    };
    try {
      // Create the deep copy
      const copy = clone(original);

      // The copy should be equivalent to the original object
      expect(copy).to.deep.equal(original);

      // Mutate the copy's values
      copy.o.value += 20;
      copy.o.o.value += 30;
      copy.o.o.a[0][0] += 40;
      copy.a[0].value += 50;
      copy.a[0].a[0].value += 60;

      // The original input and expected output should still be equivalent
      expect(original).to.deep.equal(expected);
    }
    catch(e) {
      console.log(e);
      throw e;
    }
  });

  it('Creates a deep copy of a complex array', () => {
    // The input object to make a deep copy of
    const original = [{
      test: {
        value: 20
      },
      value: 20
    }];

    // The expected object which is the same of the input to compare that
    // the input does not change when the copy is mutated
    const expected = [{
      test: {
        value: 20
      },
      value: 20
    }];

    try {
      // Create the deep copy
      const copy = clone(original);

      // The copy should be equivalent to the original object
      expect(copy).to.deep.equal(original);

      // Mutate the copy's values
      copy[0].test.value += 20;
      copy[0].value += 30;

      // The original input and expected output should still be equivalent
      expect(original).to.deep.equal(expected);
    }
    catch(e) {
      console.log(e);
      throw e;
    }
  });

  it('Creates a deep copy with a passed in interceptor', () => {
    // The input object to make a deep copy of
    const original = {
      w: [[10, 10], [11, 11], [12, 12]],
      s: [{
        w: [[10, 10], [11, 11], [12, 12]]
      }],
      useless: 'this should be omitted'
    };
    const originalExpected = {
      w: [[10, 10], [11, 11], [12, 12]],
      s: [{
        w: [[10, 10], [11, 11], [12, 12]]
      }],
      useless: 'this should be omitted'
    };

    // The expected object which is the same of the input to compare that
    // the input does not change when the copy is mutated
    const expected = {
      w: 24,
      s: [{
        w: 24
      }]
    };

    try {
      // Create the deep copy
      const copy = clone(original, (v, k) => {
        if(v.s && v.useless)
          return omit(v, 'useless');
        if(k === 'w')
          return v[2][0] + v[2][1];
        return v;
      });

      // Without any additional mutations, the copy should equal the expected
      expect(copy).to.deep.equal(expected);

      // The original should not have been mutated assuming the interceptor
      // function passed in is correct
      expect(original).to.deep.equal(originalExpected);
    }
    catch(e) {
      console.log(e);
      throw e;
    }
  });
});

