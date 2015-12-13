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

// Return a config variable. Command line has higher priority, then the
// env then rc files then the given default value
const conf = (name, def) => {
  const l = name.toLowerCase();
  const u = name.toUpperCase();
  return commander[l] || process.env[u] || def;
};

// Command line interface
const runCLI = () => {
  // Parse command line options, app script, number of instances and port
  // number to start with in a local environment
  commander
    .arguments('<cmd> [args...]')
    .action((cmd, args) => {
      commander.cmd = cmd;
      commander.args = args || [];
    })
    .option('-a, --apps <value>', 'number of apps [1]')
    .option('-i, --instances <value>', 'number of app instances [1]')
    .option('-p, --port <value>', 'port number')
    .option('-h, --host <value>', 'host name')
    .parse(process.argv);

  const cmd = commander.cmd;
  const args = commander.args;

  // Load the .apprc file into the environment
  rc();

  // Get the current app name
  const appname = require(path.join(process.cwd(), 'package.json')).name;

  if(process.env.VCAP_APPLICATION) {
    // Running on Cloud Foundry, just start the app, the PORT env var
    // should already have been set by CF
    debug('Starting application %s', appname);
    const c = cp.spawn(cmd, args, {
      stdio: 'inherit'
    });
    debug('Started application %s', appname);

    // Add listeners to stdout, stderr and exit messsage and forward the
    // messages to debug logs
    c.on('exit', (c) => debug(
      'Application %s exited with code %d', appname, c));
  }
  else {
    // In a local test environment, simulate the start of multiple apps
    // and app instances

    // Set the number of apps, instances and lower port range bound,
    // command line has higher priority then, the env then rc files then
    // default to 1 app, 1 instance and port 9080
    const napps = parseInt(conf('apps', 1));
    const ninstances = parseInt(conf('instances', 1));
    const port = parseInt(conf('port', 9080));
    const host = conf('host', undefined);

    // Start the requested number of apps
    map(range(napps), (a) => {
      // Clone and configure the process env
      const env = clone(process.env);
      if(host)
        env.HOST = host;
      env.PORT = port + a;
      env.APPS = napps;
      env.APP_NAME = appname;
      env.APP_INDEX = a;
      env.INSTANCES = ninstances;
      env.INSTANCE_INDEX = 0;
      env.CLUSTER_WORKERS = ninstances;

      debug(
        'Starting application %s.%d with port %s', appname, a, port + a);
      const c = cp.spawn(cmd, args, {
        env: env,
        stdio: 'inherit'
      });
      debug('Started application %s.%d %s', appname, a);
      c.unref();
    });
  }
};

// Export our public functions
module.exports.runCLI = runCLI;

