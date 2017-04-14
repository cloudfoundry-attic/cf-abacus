'use strict';

// Evaluate a Javascript expression.

const xeval = require('..');

describe('abacus-eval', () => {
  it('Arrow functions', () => {
    const f = xeval('(x) => x * 2');
    expect(typeof f).to.equal('function');
    expect(f(2)).to.equal(4);
  });
  
  it('Regular functions', () => {
    const f = xeval('function (x) { return x * 2 }');
    expect(typeof f).to.equal('function');
    expect(f(2)).to.equal(4);
  });
});
