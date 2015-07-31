'use strict';

// A simple sum function, used to test code coverage

// Return the sum of two numbers
const straight = (x, y) => { return x + y; };

// Here only one of the branches in the conditional is covered
const cond = (x, y) => { return x === 0 ? y : x === 1 ? 1 + y : x + y; };

// Again here, only one of the branches is covered
/* eslint no-else-return: 1 */
const ifelse = (x, y) => { if (x === 0) return y; else if (x === 1) return 1 + y; else return x + y; };

// A function that is not covered
const blah = () => { return 'boo'; };

// Export our sum function
module.exports.straight = straight;
module.exports.cond = cond;
module.exports.ifelse = ifelse;
module.exports.blah = blah;

