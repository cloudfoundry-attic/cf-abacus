'use strict';

const sandbox = sinon.createSandbox();

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

  describe('heartbeat', () => {
    let putStub;

    context('on success', () => {
      beforeEach(() => {
        putStub = sandbox.stub().yields();
        require.cache[require.resolve('abacus-request')].exports.put = putStub;
      });

      it('sends correct request', (done) => {
        eureka.heartbeat('http://test.com', 'app', 'localhost', (error) => {
          expect(error).to.equal(undefined);

          assert.calledOnce(putStub);
          assert.calledWith(putStub, 'http://test.com/apps/:app/:instance', {
            app: 'APP',
            auth: authentication(secured),
            instance: 'localhost'
          });

          done();
        });
      });
    });

    context('on error', () => {
      const error = 'error';

      beforeEach(() => {
        putStub = sandbox.stub().yields(error);
        require.cache[require.resolve('abacus-request')].exports.put = putStub;
      });

      it('calls back with error', (done) => {
        eureka.heartbeat('http://test.com', 'app', 'localhost', (error) => {
          expect(error).to.equal(error);
          done();
        });
      });
    });

    context('on bad response code', () => {
      beforeEach(() => {
        putStub = sandbox.stub().yields(undefined, { statusCode: 511 });
        require.cache[require.resolve('abacus-request')].exports.put = putStub;
      });

      it('calls back with success', (done) => {
        eureka.heartbeat('http://test.com', 'app', 'localhost', (error) => {
          expect(error).to.equal(undefined);
          done();
        });
      });
    });
  });
};

describe('abacus-eureka unsecured', () => tests(false));
describe('abacus-eureka secured', () => tests(true));
