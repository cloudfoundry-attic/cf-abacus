'use strict';

const dbclient = require('abacus-dbclient');
const createLifecycleManager = require('abacus-lifecycle-manager');
const request = require('abacus-request');

const env = {
  startTimeout: process.env.START_TIMEOUT || 5000
};

describe('eureka', function() {
  let lifecycleManager;
  this.timeout(env.startTimeout);

  let eureka;

  before((done) => {
    process.env.SECURED = true;
    process.env.JWTALGO = 'HS256';
    process.env.JWTKEY = 'encode';

    process.env.API = 'http://localhost:9882';

    process.env.EUREKA = 'http://localhost:9990';
    process.env.EUREKA_USER = 'user';
    process.env.EUREKA_PASSWORD = 'password';
    process.env.EUREKA_REGISTER_INTERVAL = 200;

    eureka = require('abacus-eureka');

    lifecycleManager = createLifecycleManager();
    const modules = [lifecycleManager.modules.authServerPlugin, lifecycleManager.modules.eurekaPlugin];

    const startModules = () => {
      lifecycleManager.startModules(modules);
      request.waitFor('http://localhost::p', { p: 9990 }, env.startTimeout, done);
    };

    dbclient.drop(process.env.DB_URI, /^abacus-/, startModules);
  });

  after(() => {
    lifecycleManager.stopAllStarted();
  });

  const checkInstance = (app, uri, expectToBeFound, done) => {
    eureka.instance(eureka.server(), app, uri, (err, instance) => {
      if (expectToBeFound)
        expect(instance.app).to.equal(app.toUpperCase());
      else
        expect(instance).to.equal(undefined);
      done(err);
    });
  };

  it('has authserver registered', (done) => {
    checkInstance('abacus-authserver-plugin', 'localhost', true, done);
  });

  it('registers an app', (done) => {
    eureka.register(eureka.server(), 'test', 1234, '127.0.0.1', (err, response) => {
      expect(err).to.equal(undefined);
      expect(response.statusCode).to.equal(204);
      done();
    });
  });

  it('deregisters an app', (done) => {
    eureka.deregister(eureka.server(), 'test', '127.0.0.1', (err, response) => {
      expect(err).to.equal(undefined);
      expect(response.statusCode).to.equal(200);

      checkInstance('test', 'localhost', false, done);
    });
  });
});
