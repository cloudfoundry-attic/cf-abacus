'use strict';

// README.md examples test

const batch = require('..');
const groupBy = batch.groupBy;
const unbatch = batch.unbatchify;

describe('abacus-batch', () => {

  const sumArray = (array) =>
    array.reduce((accumulator, currentValue) =>
      currentValue instanceof Array
        ? accumulator + sumArray(currentValue)
        : accumulator + currentValue
      , 0);

  const batchedSum = batch((calls, cb) => {
    cb(sumArray(calls));
  });

  const dummyFn = (sum) => {};

  it('sums values', (done) => {
    batchedSum(1, 2, dummyFn);
    batchedSum(4, 6, dummyFn);
    batchedSum(9, 31, (sum) => {
      expect(sum).to.equal(53);
      done();
    });
  });

  const batchedGroupingSum = batch(groupBy((calls, cb) => {
    cb(sumArray(calls));
  }, (args, cb) => {
    cb(undefined, args[0] % 2);
  }));

  it('groups values', (done) => {
    let testExecutions = 0;
    const countExecutions = () => {
      if (++testExecutions === 2) done();
    };

    batchedGroupingSum(1, 2, dummyFn);
    batchedGroupingSum(4, 6, (sum) => {
      expect(sum).to.equal(10);
      countExecutions();
    });
    batchedGroupingSum(9, 31, (sum) => {
      expect(sum).to.equal(43);
      countExecutions();
    });
  });


  const sum = (a, b, callback) => {
    callback(undefined, a + b);
  };
  const unbatchedSum = unbatch(sum);

  it('unbatches', (done) => {
    unbatchedSum([
      [1, 2],
      [5, 11],
      [8, 3]
    ], (err, result) => {
      expect(err).to.equal(undefined);
      expect(result).to.deep.equal([
        [ undefined, 3 ],
        [ undefined, 16 ],
        [ undefined, 11 ]
      ]);
      done();
    });
  });
});
