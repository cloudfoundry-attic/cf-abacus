'use strict';

// Test a simple sum module using Mocha

const sum = require('../tested/sum.js');

describe('abacus-mocha', () => {
  it('supports Chai expect assertions', () => {
    expect(sum.straight(1, 1)).to.equal(2);
  });

  it('tests branch coverage', (done) => {
    expect(sum.cond(1, 1)).to.equal(2);
    expect(sum.ifelse(1, 1)).to.equal(2);

    done();
  });
});
