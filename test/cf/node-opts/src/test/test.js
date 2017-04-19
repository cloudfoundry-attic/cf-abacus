'use strict';

const cp = require('child_process');

const commander = require('commander');
const dbclient = require('abacus-dbclient');
const request = require('abacus-request');

const _ = require('underscore');
const clone = _.clone;

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-node-options-itest');

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

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

describe('webapp', function() {

  let errOutput = '';

  this.timeout(startTimeout);

  const start = (module, done = () => {}) => {
    debug('Starting %s in directory %s', module, moduleDir(module));
    const c = cp.spawn('npm', ['run', 'start'], {
      cwd: moduleDir(module),
      env: clone(process.env)
    });

    // Add listeners to stdout, stderr and exit message and forward the
    // messages to debug logs
    c.stdout.on('data', (data) => process.stdout.write(data));
    c.stderr.on('data', (data) => {
      errOutput += data.toString();
      process.stderr.write(data);
    });
    c.on('exit', (code) => {
      debug('Module %s started with code %d', module, code);
      done();
    });
  };

  const stop = (module, dump, cb) => {
    debug('Stopping %s in directory %s', module, moduleDir(module));
    const c = cp.spawn('npm', ['run', 'stop'],
      { cwd: moduleDir(module), env: clone(process.env) });

    // Add listeners to stdout, stderr and exit message and forward the
    // messages to debug logs
    if (dump) {
      c.stdout.on('data', (data) => process.stdout.write(data));
      c.stderr.on('data', (data) => process.stderr.write(data));
    }
    c.on('exit', (code) => cb(module, code));
  };

  before(() => {
    delete process.env.NODE_OPTS;
  });

  context('with correct options', () => {
    beforeEach((done) => {
      // Start all Abacus services
      const services = () => {
        start('abacus-eureka-plugin');
        start('abacus-provisioning-plugin');
        start('abacus-account-plugin');
        start('abacus-usage-collector');
        done();
      };

      // Start local database server
      if (!process.env.DB) {
        start('abacus-pouchserver');
        services();
      }
      else
      // Delete test dbs on the configured db server
        dbclient.drop(process.env.DB, /^abacus-/, () => {
          services();
        });
    });

    afterEach((done) => {
      let counter = 5;
      const finishCb = (module, code) => {
        counter--;
        debug('Module %s exited with code %d. Left %d modules',
          module, code, counter);
        if (counter === 0) {
          debug('All modules stopped. Exiting test');
          done();
        }
      };

      stop('abacus-usage-collector', true, finishCb);
      stop('abacus-account-plugin', true, finishCb);
      stop('abacus-provisioning-plugin', true, finishCb);
      stop('abacus-eureka-plugin', true, finishCb);
      stop('abacus-pouchserver', true, finishCb);
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
    before((done) => {
      process.env.NODE_OPTS = '-foobar';
      errOutput = '';

      start('abacus-eureka-plugin', done);
    });

    after((done) => {
      stop('abacus-eureka-plugin', false, () => done());
    });

    it('fails to start apps', () => {
      expect(errOutput).to.match(/.*node: bad option: -foobar.*/);
    });
  });

});

