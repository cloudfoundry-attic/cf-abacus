'use strict';

// Simple async map, reduce, and filter data transformation functions with
// callbacks. These functions are very similar to the underscore.js map,
// reduce, and filter functions but they can take Node functions with
// callbacks, generators and promises.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');

const each = _.each;
const filter = _.filter;
const isEmpty = _.isEmpty;

const debug = require('abacus-debug')('abacus-transform');

const recursiveReduce = (memo, index, list, func, cb) => {
  const value = list[index];
  debug('Applying reduction to value %o, accum %o', value, memo);

  func(memo, value, index, list, (err, resultMemo) => {
    if (err) {
      debug('Reduction error %o', err);
      cb(err);
      return;
    }

    if (index === list.length - 1) {
      debug('Final reduction accum %o', resultMemo);
      cb(undefined, resultMemo);
      return;
    }

    recursiveReduce(resultMemo, index + 1, list, func, cb);
  });
};

// Performs a reduce operation, very similar to the one from the
// underscore.js library, except that the final result is returned
// via a callback and the iteratee passes intermediate results via a
// callback.
// The function takes four arguments: the list to be reduced, the reduce
// iteratee that will perform the reduce iterations, the initial
// memo (accumulation), and a callback that will receive the final
// result.
// The iteratee is passed five arguments: the memo (accumulated value),
// the iteration value, the iteration index, the original list
// being reduced, and lastly a callback that should be used to
// return whether there is an error and the result of the reduce iteration.
const asyncReduce = (list, func, memo, cb) => {
  debug('Reduce list %o, initial accum %o', list, memo);

  if (isEmpty(list)) {
    debug('Final reduction accum %o', memo);
    cb(undefined, memo);
    return;
  }

  const funcWithCallback = yieldable.functioncb(func);
  recursiveReduce(memo, 0, list, funcWithCallback, cb);
};

const finishMap = (err, result, cb) => {
  if(err) {
    debug('Map error %o', err);
    cb(err);
    return;
  }
  debug('Final map result %o', result);
  cb(undefined, result);
};

// Performs a map operation, very similar to the one from the
// underscore.js library, except that the final result is returned
// via a callback and the iteratee passes intermediate results via
// a callback.
// The function takes three arguments: the list to be mapped, the iteratee
// to perform the mapping operation, a callback that will receive the final
// map result.
// The iteratee is passed four arguments: the iteration value, the iteration
// index, the original list to be mapped, and lastly a callback that should
// be used to return whether there is an error and the result of the map
// iteration.
const asyncMap = (list, func, cb) => {
  debug('Map list %o', list);

  if (isEmpty(list)) {
    debug('Final map result %o', list);
    cb(undefined, list);
    return;
  }

  let mapErr = undefined;
  let mapResult = new Array(list.length);
  let mapOperations = 0;
  const funcWithCallback = yieldable.functioncb(func);

  each(list, (value, index, list) => {
    debug('Applying map to value %o', value);

    funcWithCallback(value, index, list, (err, result) => {
      debug('Map result %o', result);
      mapErr = mapErr || err;
      mapResult[index] = result;
      mapOperations++;
      if (mapOperations === list.length)
        finishMap(mapErr, mapResult, cb);
    });
  });
};

const filterSelected = (list, mask, cb) => {
  const filterCondition = (value, index, list) => mask[index];
  const result = filter(list, filterCondition);
  debug('Final filter result %o', result);
  cb(undefined, result);
};

// Performs a filter operation, very similar to the one from the
// underscore.js library, except that the final result is returned
// via a callback and the iteratee passes selection information
// via a callback.
// The function takes three arguments: the list to be filtered,
// the iteratee to perform the selection, and lastly a callback that 
// will receive the final filter result.
// The iteratee is passed four arguments: the iteration value, the iteration
// index, the original list to be filtered, and lastly a callback that should
// be used to return whether there is an error and a boolean flag indicating 
// whether the value should be preserved or not.
const asyncFilter = (list, func, cb) => {
  debug('Filter list %o', list);

  const funcWithCallback = yieldable.functioncb(func);

  asyncMap(list, funcWithCallback, (err, selection) => {
    if(err) {
      debug('Filter error %o', err);
      cb(err);
      return;
    }
    filterSelected(list, selection, cb);
  });
};

// Export our public functions
module.exports = asyncReduce;
module.exports.reduce = asyncReduce;
module.exports.map = asyncMap;
module.exports.filter = asyncFilter;

