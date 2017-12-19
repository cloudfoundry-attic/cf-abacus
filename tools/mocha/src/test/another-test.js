'use strict';

// Test a simple sum module using Mocha

const sum = require('../tested/sum.js');

describe('another-abacus-mocha', () => {
  it('runs tests', (done) => {
    expect(sum.another()).to.equal('another');
    done();
  });
});
