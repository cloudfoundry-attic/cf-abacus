'use strict';

// Evaluate a Javascript expression.

const babel = require('babel-core');

/* eslint no-eval: 1 */
/* jshint evil: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-eval');

// Evaluate the given Javascript expression
const xeval = (s) => {
  debug('Evaluating expression %s', s);
  return eval(babel.transform(s, { optional: ['runtime'] }).code);
};

// Export our public functions
module.exports = xeval;

