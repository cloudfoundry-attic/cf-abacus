'use strict';

// A simple sum function, used to test code coverage

/* eslint no-else-return: 0 */

// Return the sum of two numbers
const straight = (x, y) => {
  return x + y;
};

// Here only one of the branches in the conditional is covered
const cond = (x, y) => {
  return x === 0 ? y : x === 1 ? 1 + y : x + y;
};

// Again here, only one of the branches is covered
const ifelse = (x, y) => {
  if (x === 0) return y;
  else if (x === 1) return 1 + y;
  else return x + y;
};

// A function that is not covered
const blah = () => 'boo';

// A function that is covered by 'another-test'
const another = () => 'another';

// Export our sum function
module.exports.straight = straight;
module.exports.cond = cond;
module.exports.ifelse = ifelse;
module.exports.blah = blah;
module.exports.another = another;
