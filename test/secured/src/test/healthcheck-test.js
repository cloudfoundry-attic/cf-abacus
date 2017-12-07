'use strict';

const commander = require('commander');

const _ = require('underscore');
const clone = _.clone;

const dbclient = require('abacus-dbclient');
const lifecycleManager = require('abacus-lifecycle-manager')();
const request = require('abacus-request');

const argv = clone(process.argv);
argv.splice(1, 1, 'secured-itest');
commander
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 5000;

describe('healthcheck', function() {
  this.timeout(startTimeout);

  before((done) => {
    const modules = [
      lifecycleManager.modules.authServerPlugin,
      lifecycleManager.modules.eurekaPlugin
    ];

    const startModules = () => {
      lifecycleManager.startModules(modules);
      request.waitFor('http://localhost::p', { p: 9882 },
        startTimeout, (err, value) => done(err));
    };

    if (!process.env.DB) {
      modules.push(lifecycleManager.modules.pouchserver);
      startModules();
    }
    else
      dbclient.drop(process.env.DB, /^abacus-/, startModules);
  });

  after(() => {
    lifecycleManager.stopAllStarted();
  });

  it('responds healthy', (done) => {
    request.get('http://localhost:9990/healthcheck', {
      auth: {
        user: 'testUser',
        password: 'testPassword'
      }
    }, (err, response) => {
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ healthy: true });
      done(err);
    });
  });

});
