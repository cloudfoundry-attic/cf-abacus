'use strict';

// Test a simple sum module using Mocha
const sum = require('../tested/sum.js');

describe('cf-abacus-mocha', () => {
    it('runs tests', (done) => {

        // Test support for Chai expect assertions
        expect(sum.straight(1, 1)).to.equal(2);

        // Test branch coverage
        expect(sum.cond(1, 1)).to.equal(2);
        expect(sum.ifelse(1, 1)).to.equal(2);

        done();
    });
});

