'use strict';

const commander = require('commander');

const _ = require('underscore');
const clone = _.clone;

const dbclient = require('abacus-dbclient');
const npm = require('abacus-npm');
const request = require('abacus-request');

// Parse command line options
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
    process.env.SECURED = true;
    process.env.JWTALGO = 'HS256';
    process.env.JWTKEY = 'encode';

    process.env.CF_API = 'http://localhost:9882';

    process.env.EUREKA = 'http://localhost:9990';
    process.env.EUREKA_USER = 'user';
    process.env.EUREKA_PASSWORD = 'password';
    process.env.EUREKA_REGISTER_INTERVAL = 200;

    const modules = [
      npm.modules.authServerPlugin,
      npm.modules.eurekaPlugin
    ];

    const startModules = () => {
      npm.startModules(modules, () => {
        request.waitFor('http://localhost::p/eureka/v2', { p: 9882 },
          startTimeout, (err, value) => done(err));
      });
    };

    if (!process.env.DB) {
      modules.push(npm.modules.pouchserver);
      startModules();
    }
    else
      dbclient.drop(process.env.DB, /^abacus-/, startModules);
  });

  after((done) => {
    npm.stopAllStarted(done);
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
