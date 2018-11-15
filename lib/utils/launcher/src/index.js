'use strict';

// Launch multiple instances of an application and set its env variable
// to simulate how applications get started in the cloud.

const { clone } = require('underscore');
const cp = require('child_process');
const commander = require('commander');
const path = require('path');

// Setup debug log
const debug = require('abacus-debug')('abacus-launcher');

// Command line interface
const runCLI = () => {
  commander
    .arguments('<cmd> [args...]')
    .action((cmd, args) => {
      commander.cmd = cmd;
      commander.args = args || [];
    })
    .parse(process.argv);

  const cmd = commander.cmd;
  const args = commander.args;

  process.env.TZ = 'UTC';

  // Get the current app name
  const cwd = process.cwd();
  const appname = require(path.join(cwd, 'package.json')).name;
  let childProcess;

  if (process.env.VCAP_APPLICATION) {
    // Running on Cloud Foundry, just start the app, the PORT env var should already have been set by CF
    debug('Starting CF application %s in %s', appname, cwd);
    childProcess = cp.spawn(cmd, args, {
      stdio: 'inherit'
    });
    debug('Started CF application %s', appname);

    // Add listeners to stdout, stderr and exit message and forward the
    // messages to debug logs
    childProcess.on('exit', (c) => debug('Application %s exited with code %d', appname, c));
  } else {
    // Clone and configure the process env
    const env = clone(process.env);
    env.PORT = process.env.PORT || process.env.npm_package_config_port;
    env.APPS = 1;
    env.APP_NAME = appname;
    env.APP_INDEX = 0;
    env.INSTANCES = 1;
    env.INSTANCE_INDEX = 0;

    debug('Starting local application %s in %s', appname, cwd);
    childProcess = cp.spawn(cmd, args, {
      env: env,
      stdio: 'inherit'
    });
    debug('Started local application %s', appname);
    childProcess.unref();
  }

  return childProcess;
};

// Export our public functions
module.exports.runCLI = runCLI;
