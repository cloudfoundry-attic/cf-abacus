'use strict';

// Lauch multiple instances of an application and set its CF VCAP_APPLICATION
// env variable to simulate how applications get started on Cloud Foundry.

const _ = require('underscore');
const cp = require('child_process');
const commander = require('commander');

const range = _.range;
const map = _.map;
const clone = _.clone;

// Setup debug log
const debug = require('abacus-debug')('abacus-instance-launcher');

// Command line interface
const runCLI = () => {
  // Parse command line options, app script, number of instances and port
  // number to start with in a local environment
  commander
    .arguments('<app>')
    .action((app) => {
      commander.app = app;
    })
    .option('-i, --instances <value>', 'number of app instances [1]', '1')
    .option('-p, --port <value>', 'port number [9080]', '9080')
    .parse(process.argv);

  const app = commander.app;
  const n = parseInt(commander.instances);
  const port = parseInt(commander.port) || 9080;

  if(process.env.VCAP_APPLICATION) {
    // Running on Cloud Foundry, we don't need to simulate anything, just
    // start the specified app
    debug('Starting application %s', app);
    const c = cp.spawn('npm', ['run', app, '--', '--port', port], {});
    debug('Started application %s', app);

    // Add listeners to stdout, stderr and exit messsage and forward the
    // messages to debug logs
    c.stdout.on('data', (d) => process.stdout.write(d));
    c.stderr.on('data', (d) => process.stderr.write(d));
    c.on('exit', (c) => debug('Application exited with code %d', c));

  }
  else
    // In a local test environment, simulate the start of multiple app
    // instances
    map(range(n), (i) => {
      // Clone the process env and set values for PORT and VCAP_APPLICATION
      // variables
      const env = clone(process.env);
      env.VCAP_APPLICATION = JSON.stringify({
        instance_index: i
      });

      debug(
        'Starting application %s instance %s with port %s', app, i, port + i);
      const c = cp.spawn('npm', ['run', app, '--', '--port', port + i], {
        env: env
      });
      debug('Started application instance %s', i);

      // Add listeners to stdout, stderr and exit messsage and forward the
      // messages to debug logs
      c.stdout.on('data', (d) => process.stdout.write(d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('exit', (c) => debug('Application instance exited with code %d', c));
    });
};

// Export our public functions
module.exports.runCLI = runCLI;

