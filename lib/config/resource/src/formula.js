'use strict';

// Support for usage metering/accumulation formulas

// These formulas are deprecated, we're now using meter, accumulate, aggregate
// and rate Javascript functions instead

const _ = require('underscore');

const rest = _.rest;
const clone = _.clone;
const map = _.map;
const reduce = _.reduce;
const flatten = _.flatten;

/* eslint no-eval: 1 */
/* jshint evil: true */

// Given a formula string, creates pairs of operands and operators
// ex: SUM({BYTE}/12*{Memory.INSTANCE}*{HOUR}) is split into
// ['{BYTE}/', '12*', '{Memory.INSTANCE}*', '{HOUR}']
// then ['{BYTE}/', '12*', '{Memory.INSTANCE}*', '{HOUR}'] is mapped to
// [['BYTE', '/'], ['12', '*'], ['Memory.INSTANCE', '*'], ['HOUR', '']]
const ops = (f) => map(
    rest(f.match(/\s*{\s*[\w.]*\s*}[*//+-]?|\s*\w+\s*[*//+-]?/g)),
    (s) => rest(s.match(/\s*{?\s*([\w.]*)\s*}?([*//+-]?)/)));

// Given a set of (operand, operator) pairs, creates a formula string
// ex: [['BYTE', '/'], ['12', '*'], ['Memory.INSTANCE', '*'], ['HOUR', '']]$
// is mapped to [['m.BYTE', '/'], ['12', '*'], ['m.Memory.INSTANCE', '*'],
// ['m.HOUR', '']]
// [['m.BYTE', '/'], ['12', '*'], ['m.Memory.INSTANCE', '*'], ['m.HOUR', '']]
// is flattened to ['m.BYTE', '/', '12', '*', 'm.Memory.INSTANCE', '*',
// 'm.HOUR', '']
// ['m.BYTE', '/', '12', '*', 'm.Memory.INSTANCE', '*', 'm.HOUR', ''] is
// reduced to 'm.BYTE / 12 * m.Memory.INSTANCE * m.HOUR'
const formula = (f) => reduce(flatten(map(ops(f), (p) => {
  if(isNaN(p[0])) {
    const o = clone(p);
    o[0] = 'm.' + p[0];
    return o;
  }
  return p;
})), (s, v) => v ? s ? s + ' ' + v : v : s);

// Convert a formula string to a meter function
const meterfn = (f) => {
  const s = formula(f);
  const fn = (m) => {
    return eval(s);
  };
  fn.source = s;
  return fn;
};

// Convert a formula string to an accumulation function
const accumfn = (f) => {
  // Parse the formula and return the accumulation operator
  const op = /\s*(\S*)\(/.exec(f) ? /\s*(\S*)\(/.exec(f)[1] : 'SUM';

  return {
    SUM: (a, c) => a ? a + c : c,
    MAX: (a, c) => a ? Math.max(a, c) : c,
    AVG: (a, c) => a ? { sum: a.sum + c, count: a.count + 1,
      avg: (a.sum + c) / (a.count + 1) } : { sum: c, count: 1, avg: c }
  }[op];
};


// Export our public functions
module.exports.meterfn = meterfn;
module.exports.accumfn = accumfn;

