'use strict';

// Test a simple sum module using Mocha

// Implemented in ES5 for now
/* eslint no-var: 0 */

const sum = require('../tested/sum.js');

describe('another-abacus-mocha', () => {
  it('runs tests', (done) => {
    expect(sum.another()).to.equal('another');
    done();
  });
});

