'use strict';

// Evaluate a Javascript expression.

const vm = require('vm');
const { VM } = require('vm2');

// Setup debug log
const debug = require('abacus-debug')('abacus-eval');
const edebug = require('abacus-debug')('e-abacus-eval');

const timeout = process.env.EVAL_TIMEOUT ? 
  parseInt(process.env.EVAL_TIMEOUT) : 100;

const vmtype = process.env.EVAL_VMTYPE || 'vm';

/* eslint no-eval: 1 */
/* jshint evil: true */

// Evaluate the given Javascript expression in a sandbox with the given context
// using the configured timeout and VM type
const xeval = (s, c) => {
  const context = c || {};
  debug('Evaluating expression %s with context %o and timeout %d using %s', 
    s, context, timeout, vmtype);

  try {
    switch (vmtype) {
      case 'vm':
        vm.createContext(context);
        return vm.runInContext(s, context, { timeout: timeout });
      case 'vm2':
        const vm2 = new VM({
          timeout: timeout,
          sandbox: {} // Empty, populated by freeze below
        });
        // Freeze each context member and add it to global
        Object.keys(context).forEach((key) => vm2.freeze(context[key], key));
        return vm2.run(s);
      default:
        throw new Error('Unsupported VM type ' + vmtype);
    }
  }
  catch (ex) {
    if (s === 'f(...args)' && c.f && c.args)
      edebug('Calling function %s with arguments %o and timeout %d using %s' +
        ' failed with %s', c.f.toString(), c.args, timeout, vmtype, ex);
    else
      edebug('Evaluating expression %s with context %o and timeout %d' +
        ' using %s failed with %s', s, context, timeout, vmtype, ex);
    throw ex;
  }
};

// Check that the given Javascript expression does not contain dangerous types,
// such as Promise
const check = (s) => {
  debug('Checking expression %s', s);
  try {
    if (s.includes('Promise'))
      throw new Error('Promises not supported');
  }
  catch (ex) {
    edebug('Checking expression %s failed with %s', s, ex);
    throw ex;
  }
};

// Evaluate the given Javascript expression in a sandbox to a function 
// using strict mode, and return a new function that calls the above function, 
// also in a sandbox
const xevalfn = (s, c) => {
  try {
    check(s);
    const f = xeval('"use strict"; (' + s + ')', c);
    return (...args) => xeval('f(...args)', { f: f, args: args });
  }
  catch (ex) {
    return (...args) => {
      throw ex;
    };
  }
};

// Export our public functions
module.exports = xevalfn;
