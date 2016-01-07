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
//
// ex: SUM({memory}/12*{instances}*{time}) is split into
// ['{memory}/', '12*', '{instances}*', '{time}']
//
// then ['{memory}/', '12*', '{instances}*', '{time}'] is mapped to
// [['memory', '/'], ['12', '*'], ['instances', '*'], ['time', '']]
const ops = (f) => map(
    rest(f.match(/\s*{\s*[\w.]*\s*}[*//+-]?|\s*\w+\s*[*//+-]?/g)),
    (s) => rest(s.match(/\s*{?\s*([\w.]*)\s*}?([*//+-]?)/)));

// Given a set of (operand, operator) pairs, creates a formula string
//
// ex: [['memory', '/'], ['12', '*'], ['instances', '*'], ['time', '']]$
// is mapped to [['m.memory', '/'], ['12', '*'], ['m.instances', '*'],
// ['m.time', '']]
//
// [['m.memory', '/'], ['12', '*'], ['m.instances', '*'], ['m.time', '']]
// is flattened to ['m.memory', '/', '12', '*', 'm.instances', '*',
// 'm.time', '']
//
// ['m.memory', '/', '12', '*', 'm.instances', '*', 'm.time', ''] is
// reduced to 'm.memory / 12 * m.instances * m.time'
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

