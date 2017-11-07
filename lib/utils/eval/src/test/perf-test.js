'use strict';

// Check performance of eval

const _ = require('underscore');
const async = require('async');

async.each(['vm', 'vm2'], (vmtype, vmCb) => {

  describe(`abacus-eval performance: ${vmtype}`, function() {
    let xeval;

    before(() => {
      process.env.EVAL_VMTYPE = vmtype;
      delete require.cache[require.resolve('..')];
      xeval = require('..');
    });

    const repeats = 100;
    this.timeout(2000);

    it(`evaluates function ${repeats} times`, () => {
      _.times(repeats, () => {
        const f = xeval('(x) => x * 2');
        expect(typeof f).to.equal('function');
        expect(f(2)).to.equal(4);
      });
    });

  });

  vmCb();
});
