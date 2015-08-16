'use strict';

// A simple sum function, used to test code coverage

// Implemented in ES5 for now
/* eslint no-var: 0 */

/* eslint no-else-return: 0 */

// Return the sum of two numbers
var straight = function(x, y) {
  return x + y;
};

// Here only one of the branches in the conditional is covered
var cond = function(x, y) {
  return x === 0 ? y : x === 1 ? 1 + y : x + y;
};

// Again here, only one of the branches is covered
var ifelse = function(x, y) {
  if(x === 0) return y;
  else if(x === 1) return 1 + y;
  else return x + y;
};

// A function that is not covered
var blah = function() {
  return 'boo';
};

// Export our sum function
module.exports.straight = straight;
module.exports.cond = cond;
module.exports.ifelse = ifelse;
module.exports.blah = blah;

