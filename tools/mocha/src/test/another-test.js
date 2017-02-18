'use strict';

// Test a simple sum module using Mocha

// Implemented in ES5 for now
/* eslint no-var: 0 */

var sum = require('../tested/sum.js');

describe('another-abacus-mocha', function() {
  it('runs tests', function(done) {
    expect(sum.another()).to.equal('another');
    done();
  });
});

