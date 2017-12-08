'use strict';

const sandbox = sinon.sandbox.create();

const authentication = (secured) =>
  secured
    ? {
      user: 'user',
      password: 'password'
    }
    : undefined;

const tests = (secured) => {
  let eureka;

  before(() => {
    process.env.SECURED = secured ? 'true' : 'false';
    process.env.EUREKA_USER = 'user';
    process.env.EUREKA_PASSWORD = 'password';

    require('abacus-request');
    eureka = require('..');
  });

  after(() => {
    delete process.env.SECURED;
    delete process.env.EUREKA_USER;
    delete process.env.EUREKA_PASSWORD;

    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('deregister', () => {
    let deleteStub;

    context('on success', () => {
      const okResponse = { statusCode: 200 };

      beforeEach(() => {
        deleteStub = sandbox.stub().yields(undefined, okResponse);
        require.cache[require.resolve('abacus-request')].exports.delete = deleteStub;
      });

      it('sends correct request', (done) => {
        eureka.deregister('http://test.com', 'app', 'localhost', (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.equal(okResponse);

          assert.calledOnce(deleteStub);
          assert.calledWith(deleteStub, 'http://test.com/apps/:app/:instance', {
            app: 'APP',
            auth: authentication(secured),
            instance: 'localhost'
          });

          done();
        });
      });
    });

    context('on bad response', () => {
      const okResponse = { statusCode: 500 };

      beforeEach(() => {
        deleteStub = sandbox.stub().yields(undefined, okResponse);
        require.cache[require.resolve('abacus-request')].exports.delete = deleteStub;
      });

      it('sends correct request', (done) => {
        eureka.deregister('http://test.com', 'app', 'localhost', (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.equal(okResponse);
          done();
        });
      });
    });

    context('on error', () => {
      const error = { statusCode: 500 };

      beforeEach(() => {
        deleteStub = sandbox.stub().yields(error);
        require.cache[require.resolve('abacus-request')].exports.delete = deleteStub;
      });

      it('sends correct request', (done) => {
        eureka.deregister('http://test.com', 'app', 'localhost', (err, val) => {
          expect(err).to.equal(error);
          expect(val).to.equal(undefined);
          done();
        });
      });
    });
  });
};

describe('abacus-eureka unsecured', () => tests(false));
describe('abacus-eureka secured', () => tests(true));
