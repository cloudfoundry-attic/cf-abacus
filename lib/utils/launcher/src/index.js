'use strict';

// Lauch multiple instances of an application and set its env variable
// to simulate how applications get started in the cloud.

const _ = require('underscore');
const cp = require('child_process');
const commander = require('commander');
const rc = require('abacus-rc');
const path = require('path');

const range = _.range;
const map = _.map;
const clone = _.clone;

// Setup debug log
const debug = require('abacus-debug')('abacus-launcher');

// Command line interface
const runCLI = () => {
  // Parse command line options, app script, number of instances and port
  // number to start with in a local environment
  commander
    .arguments('<cmd>')
    .action((cmd) => {
      commander.cmd = cmd;
    })
    .option('-i, --instances <value>', 'number of app instances [1]')
    .option('-p, --port <value>', 'port number')
    .parse(process.argv);

  const cmd = commander.cmd;

  // Load the .apprc file into the environment
  rc();

  // Get the current app name
  const app = require(path.join(process.cwd(), 'package.json')).name;

  // Use number of instances and port from the command line if they're
  // not defined in the environment
  const n = commander.instances ? parseInt(commander.instances) :
    process.env.INSTANCES ? parseInt(process.env.INSTANCES) : 1;
  const port = commander.port ? parseInt(commander.port) :
    process.env.PORT ? parseInt(process.env.PORT) : 9080;

  if(process.env.VCAP_APPLICATION) {
    // Running on Cloud Foundry, we don't need to simulate anything, just
    // start the specified app
    debug('Starting application %s', app);
    const c = cp.spawn('npm', ['run', cmd, '--', '--port', port], {});
    debug('Started application %s', app);

    // Add listeners to stdout, stderr and exit messsage and forward the
    // messages to debug logs
    c.stdout.on('data', (d) => process.stdout.write(d));
    c.stderr.on('data', (d) => process.stderr.write(d));
    c.on('exit', (c) => debug(
      'Application %s exited with code %d', app, c));
  }
  else
    // In a local test environment, simulate the start of multiple app
    // instances
    map(range(n), (i) => {
      // Clone the process env and set values for PORT and VCAP_APPLICATION
      // variables
      const env = clone(process.env);
      env.INSTANCES = n;
      env.INSTANCE_INDEX = i;

      debug(
        'Starting application %s instance %s with port %s', app, i, port + i);
      const c = cp.spawn('npm', ['run', cmd, '--', '--port', port + i], {
        env: env
      });
      debug('Started application %s instance %s', app, i);

      // Add listeners to stdout, stderr and exit messsage and forward the
      // messages to debug logs
      c.stdout.on('data', (d) => process.stdout.write(d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('exit', (c) => debug(
        'Application %s instance exited with code %d', app, c));
    });
};

// Export our public functions
module.exports.runCLI = runCLI;

