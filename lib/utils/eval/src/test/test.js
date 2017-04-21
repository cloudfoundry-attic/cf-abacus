'use strict';

// Evaluate a Javascript expression.

const async = require('async');

async.each(['vm', 'vm2'], (vmtype, cb) => {
  describe('abacus-eval (' + vmtype + ')', () => {
    const vm2it = vmtype === 'vm' ? it.skip : it;
    let xeval;

    before(() => {
      process.env.EVAL_VMTYPE = vmtype;
      delete require.cache[require.resolve('..')];
      xeval = require('..');
    }); 

    context('with valid input', () => {
      it('evaluates arrow functions', () => {
        const f = xeval('(x) => x * 2');
        expect(typeof f).to.equal('function');
        expect(f(2)).to.equal(4);
      });
      
      it('evaluates regular functions', () => {
        const f = xeval('function (x) { return x * 2 }');
        expect(typeof f).to.equal('function');
        expect(f(2)).to.equal(4);
      });

      it('evaluates functions returning objects', () => {
        const f = xeval('() => ({ x: 42 })');
        expect(typeof f).to.equal('function');
        expect(f()).to.deep.equal({ x: 42 });
      });
    });

    context('with invalid or malicious input', () => {
      it('rejects non-functions', () => {
        const f = xeval('42');
        expect(typeof f).to.equal('function');
        expect(f).to.throw('Function.prototype.apply was called on 42, ' + 
          'which is a number and not a function');
      });

      it('prevents endless loops', () => {
        const f = xeval('() => { while (true) {} }');
        expect(typeof f).to.equal('function');
        expect(f).to.throw('Script execution timed out');
      });

      it('prevents asynchronus execution with Promises', () => {
        const f = xeval(`() => {
          return new Promise((resolve, reject) => resolve())
            .then(function(value) { while(true); })
        }`);
        expect(typeof f).to.equal('function');
        expect(f).to.throw('Promises not supported');
      });

      it('prevents direct usage of built-in modules and globals', () => {
        const f = xeval('() => console.log("Hi")');
        expect(typeof f).to.equal('function');
        expect(f).to.throw('console is not defined');
      });

      it('prevents requiring modules', () => {
        const f = xeval('() => require("console").log("Hi")');
        expect(typeof f).to.equal('function');
        expect(f).to.throw('require is not defined');
      });

      vm2it('prevents escaping via this.constructor.constructor', () => {
        const f = xeval(
          '() => this.constructor.constructor("return console")().log("Hi")');
        expect(typeof f).to.equal('function');
        expect(f).to.throw('console is not defined');
      });

      it('prevents escaping via global.constructor.constructor', () => {
        const f = xeval(`() => {
          const ForeignFunction = global.constructor.constructor;
          const process1 = ForeignFunction("return process")();
          const require1 = process1.mainModule.require;
          const console1 = require1("console");
          console1.log("Hi");
        }`);
        expect(typeof f).to.equal('function');
        expect(f).to.throw('is not defined');
      });

      it('rejects arguments.callee', () => {
        const f = xeval('function (x) { return arguments.callee; }');
        expect(typeof f).to.equal('function');
        expect(f).to.throw(
          '\'caller\', \'callee\', and \'arguments\' properties ' +
          'may not be accessed on strict mode functions or the arguments ' +
          'objects for calls to them');
      });

      vm2it('prevents changes to the context', () => {
        const util = {
          add: (a, b) => a + b
        };
        const f = xeval('() => { util.add = (a, b) => a - b; }' , 
          { util: util });
        expect(typeof f).to.equal('function');
        expect(f).to.throw(
          '\'set\' on proxy: trap returned falsish for property \'add\'');
      });
    });
  });

  cb();
});

