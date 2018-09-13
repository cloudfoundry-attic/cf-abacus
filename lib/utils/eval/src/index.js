'use strict';

// Evaluate a Javascript expression.

const _ = require('underscore');
const extend = _.extend;

const vm = require('vm');
const { VM } = require('vm2');

// Setup debug log
const debug = require('abacus-debug')('abacus-eval');
const edebug = require('abacus-debug')('e-abacus-eval');

const timeout = process.env.EVAL_TIMEOUT ? { timeout: parseInt(process.env.EVAL_TIMEOUT) } : {};
const timeoutErrorMessage = 'Script execution timed out.';

const vmtype = process.env.EVAL_VMTYPE || 'vm';

const runVM = (expression, context) => {
  vm.createContext(context);
  return vm.runInContext(expression, context, timeout);
};

const runVM2 = (expression, context) => {
  const vm2 = new VM(
    extend(
      {
        sandbox: {} // Empty, populated by freeze below
      },
      timeout
    )
  );
  // Freeze each context member and add it to global
  Object.keys(context).forEach((key) => vm2.freeze(context[key], key));
  return vm2.run(expression);
};

const runInSandbox = (vmtype, expression, context) => {
  switch (vmtype) {
    case 'vm':
      return runVM(expression, context);
    case 'vm2':
      return runVM2(expression, context);
    default:
      throw new Error('Unsupported VM type ' + vmtype);
  }
};

const runHandler = (vmtype, expression, context) => {
  let result;
  try{
    result = runInSandbox(vmtype, expression, context);
  } catch(err) {
    if(err.message === timeoutErrorMessage)
      extend(err, { timeoutError: true });
    else
      extend(err, { expressionError: true });

    throw err;
  }

  return result;
};

// Evaluate the given Javascript expression in a sandbox with the given context
// using the configured timeout and VM type
const xeval = (expression, context) => {
  const ctx = context || {};
  debug('Evaluating expression %s with context %o and %o using %s', expression, ctx, timeout, vmtype);
  try {
    return runHandler(vmtype, expression, ctx);
  } catch (ex) {
    if (expression === 'f(...args)' && context.f && context.args)
      edebug(
        'Calling function %s with arguments %o and timeout %d using %s failed with %s',
        context.f.toString(),
        context.args,
        timeout.timeout,
        vmtype,
        ex
      );
    else
      edebug(
        'Evaluating expression %s with context %o and timeout %d using %s failed with %s',
        expression,
        ctx,
        timeout.timeout,
        vmtype,
        ex
      );

    throw ex;
  }
};

// Check that the given Javascript expression does not contain dangerous types, such as Promise
const check = (expression) => {
  debug('Checking expression %s', expression);
  if (expression.includes('Promise')) {
    edebug('Promises not supported: %s ', expression);
    throw new Error('Promises not supported');
  }
};

const buildEvalExpression = (expression) => `"use strict"; (${expression})`;

// Evaluate the given Javascript expression in a sandbox to a function
// using strict mode, and return a new function that calls the above function,
// also in a sandbox
const xevalfn = (expression, context) => {
  try {
    check(expression);
    const evalExpression = buildEvalExpression(expression);
    const f = xeval(evalExpression, context);
    return (...args) => xeval('f(...args)', { f: f, args: args });
  } catch (ex) {
    return (...args) => {
      throw ex;
    };
  }
};

// Export our public functions
module.exports = xevalfn;
