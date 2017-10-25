abacus-batch
===

Batching for async function calls.

This module provides a simple way to implement function call batching. Batching
is achieved by wrapping a function in logic that records calls in a batch for
some time then calls that function once with the accumulated batch, giving it an
opportunity to process all the calls efficiently at once. Unbatching takes a
batch of calls, applies then individually to a function, then returns a batch of
results.

## require('abacus-batch') or require('abacus-batch').batchify

The batch function allows us to delegate the processing of a given function after a number of function calls have occurred.

```js
const batch = require('abacus-batch');
const batchedSum = batch((calls, cb) => {
  // calls will equal to
  // [
  //   [1, 2],
  //   [4, 6],
  //   [9, 31]
  // ]
  cb(undefined, [
      // we need to place the results of each individual call here.
  ]);
});

batchedSum(1, 2);
batchedSum(4, 6);
batchedSum(9, 31);
```

We can control the amount of time that calls are accumulated before our batched function is called via an additional argument to batch.

```js
const batchedSum = batch(() => {}, 1000);
```

The example above will wait 1 second before calling the lambda.

We can also specify a maximum number of invocations before the batched function is called.

```js
const batchedSum = batch(() => {}, 1000, 10);
```

The function above will wait for 1 second or 10 invocations before it calls the lambda function.

Finally, it is possible to implement a custom count function.

```js
const batchedSum = batch(() => {}, 1000, 10, (name, args) => args.length);
```

The above function will wait for 1 second or until the number of arguments of all the accumulated functions is equal to `10`. The `name` argument of the last callback is the name of the function.

## require('abacus-batch').groupBy

Intended to be used with the `batch` function. It allows one to group accumulated calls into buckets and then have each bucket sent to the lambda function.

For example:

```js
const batch = require('abacus-batch');
const groupBy = require('abacus-batch').groupBy;
const batchedSum = batch(groupBy((calls, cb) => {
  // this function will be called twice.
  // the first time, calls will equal to
  // calls will equal to
  // [
  //   [1, 2],
  //   [9, 31]
  // ]
  // the second time, calls will equal to
  // [
  //   [4, 6]
  // ]
  cb(undefined, [
      // we need to place the results of each individual call here.
  ]);
}, (args) => {
  // we will group by whether the first argument is odd or even
  // all we need to do is return an id for each group. in our case, we
  // use the remainder of the devision as the bucket id.
  return args[0] % 2
}));

batchedSum(1, 2);
batchedSum(4, 6);
batchedSum(9, 31);
```

## require('abacus-batch').unbatchify

This is the reverse of the batchify function. It allows a collection of calls to be split apart, resulting in individual calls.

```js
const unbatch = require('abacus-batch').unbatchify;
const sum = (a, b, callback) => {
  // will be called three times with the following set of arguments
  // 1. a = 1; b = 2
  // 2. a = 5; b = 11
  // 3. a = 8; b = 3
  callback(undefined, a + b);
};
const unbatchedSum = unbatch(sum);

unbatchedSum([
  [1, 2],
  [5, 11],
  [8, 3]
], (err, result) => {
  // results will equal
  // [
  //   [undefined, 3],
  //   [undefined, 16],
  //   [undefined, 11]
  // ]
});
```
