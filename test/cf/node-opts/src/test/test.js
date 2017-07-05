'use strict';

const commander = require('commander');
const dbclient = require('abacus-dbclient');
const request = require('abacus-request');

const _ = require('underscore');
const clone = _.clone;

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-collector-itest');
commander
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 30000;

describe('webapp', function() {
  let npm;
  this.timeout(startTimeout);

  before(() => {
    delete process.env.NODE_OPTS;
  });

  afterEach((done) => {
    npm.stopAllStarted(done);
  });

  context('with correct options', () => {
    npm = require('abacus-npm');

    beforeEach((done) => {
      const modules = [
        npm.modules.eurekaPlugin,
        npm.modules.provisioningPlugin,
        npm.modules.accountPlugin,
        npm.modules.collector
      ];

      if (!process.env.DB) {
        modules.push(npm.modules.pouchserver);
        npm.startModules(modules, done);
      }
      else
        dbclient.drop(process.env.DB, /^abacus-/, () => {
          npm.startModules(modules, done);
        });
    });

    context('with v8 GC options', () => {
      before(() => {
        process.env.NODE_OPTS = '--max_old_space_size=400';
      });

      it('starts all apps', (done) => {
        // Wait for usage collector to start
        request.waitFor('http://localhost::p/batch',
          { p: 9080 }, startTimeout, (err, value) => {
            // Failed to ping usage collector before timing out
            if (err) throw err;

            done();
          });
      });
    });

    context('without any options', () => {
      it('starts all apps', (done) => {
        // Wait for usage collector to start
        request.waitFor('http://localhost::p/batch',
          { p: 9080 }, startTimeout, (err, value) => {
            // Failed to ping usage collector before timing out
            if (err) throw err;

            done();
          });
      });
    });
  });

  context('with incorrect options', () => {
    let errorOutput = '';
    const errorStream = {
      write: (data) => {
        errorOutput += data;
      }
    };

    npm = require('abacus-npm').use({
      out: process.stdout,
      err: errorStream
    });

    before((done) => {
      process.env.NODE_OPTS = '-foobar';
      npm.startModules([npm.modules.eurekaPlugin], done);
    });

    it('fails to start apps', () => {
      expect(errorOutput).to.match(/.*node: bad option: -foobar.*/);
    });
  });

});
