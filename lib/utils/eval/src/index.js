'use strict';

// Evaluate a Javascript expression.

const babel = require('babel-core');
const vm = require('vm');

/* eslint no-eval: 1 */
/* jshint evil: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-eval');

// Evaluate the given Javascript expression
const xeval = (s, c) => {
  const context = c || {};
  debug('Evaluating expression %s with context %c', s, context);
  vm.createContext(context);
  return vm.runInContext(
    babel.transform('(' + s + ')', { presets: ['es2015'] }).code, context);
};

// Export our public functions
module.exports = xeval;

