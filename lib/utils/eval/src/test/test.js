'use strict';

// Evaluate a Javascript expression.

const xeval = require('..');

describe('abacus-eval', () => {
  it('evaluates Javascript expressions', () => {
    const f = xeval('(x) => x * 2');

    expect(typeof f).to.equal('function');
    expect(f(2)).to.equal(4);
  });
});

