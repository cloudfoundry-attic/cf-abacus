'use strict';

const sandbox = sinon.sandbox.create();

const authentication = (secured) => secured ? {
  user: 'user',
  password: 'password'
} : undefined;

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

  describe('register', () => {

    let postStub;

    context('on success', () => {
      const okResponse = { statusCode: 204 };

      beforeEach(() => {
        postStub = sandbox.stub().yields(undefined, okResponse);
        require.cache[require.resolve('abacus-request')].exports.post =
          postStub;

        process.env.EUREKA_REGISTER_INTERVAL = 1;
      });

      it('sends correct request', (done) => {
        eureka.register('http://test.com', 'test', 1234, '127.0.0.1',
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.equal(okResponse);

            assert.calledOnce(postStub);
            assert.calledWith(postStub, 'http://test.com/apps/:app', {
              app: 'TEST',
              auth: authentication(secured),
              body: {
                instance: {
                  app: 'TEST',
                  asgName: 'TEST',
                  dataCenterInfo: {
                    '@class':
                      'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
                    name: 'MyOwn'
                  },
                  hostName: '127.0.0.1',
                  ipAddr: '127.0.0.1',
                  metadata: { port: 1234 },
                  port: { $: 1234, '@enabled': true },
                  status: 'UP',
                  vipAddress: '127.0.0.1'
                }
              }
            });

            done();
          }
        );
      });
    });

    context('on error', () => {
      const error = 'error';

      beforeEach(() => {
        postStub = sandbox.stub().yields(error);
        require.cache[require.resolve('abacus-request')].exports.post =
          postStub;

        process.env.EUREKA_REGISTER_INTERVAL = 1;

        eureka.register('http://test.com', 'test', 1234, '127.0.0.1',
          (err, val) => {
            done(new Error(`Unexpected call-back with ${err} and ${val}`));
          }
        );
      });

      it('retries', (done) => {
        setTimeout(() => {
          expect(postStub.callCount).to.be.above(2);
          done();
        }, 1000);
      });
    });

    context('on bad response', () => {
      const errorResponse = { statusCode: 500 };

      beforeEach(() => {
        postStub = sandbox.stub().yields(undefined, errorResponse);
        require.cache[require.resolve('abacus-request')].exports.post =
          postStub;

        process.env.EUREKA_REGISTER_INTERVAL = 1;

        eureka.register('http://test.com', 'test', 1234, '127.0.0.1',
          (err, val) => {
            done(new Error(`Unexpected call-back with ${err} and ${val}`));
          }
        );
      });

      it('retries', (done) => {
        setTimeout(() => {
          expect(postStub.callCount).to.be.above(2);
          done();
        }, 1000);
      });
    });
  });
};

describe('abacus-eureka unsecured', () => tests(false));
describe('abacus-eureka secured', () => tests(true));
