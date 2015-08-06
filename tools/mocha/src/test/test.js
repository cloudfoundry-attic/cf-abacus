'use strict';

// Test a simple sum module using Mocha

// Implemented in ES5 for now
/* eslint no-var: 0 */

var sum = require('../tested/sum.js');

describe('abacus-mocha', function() {
  it('runs tests', function(done) {

    // Test support for Chai expect assertions
    expect(sum.straight(1, 1)).to.equal(2);

    // Test branch coverage
    expect(sum.cond(1, 1)).to.equal(2);
    expect(sum.ifelse(1, 1)).to.equal(2);

    done();
  });
});

