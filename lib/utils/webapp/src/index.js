'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.
// Also sets up some call perf metrics collection across the cluster.

const _ = require('underscore');
const express = require('abacus-express');
const cluster = require('abacus-cluster');
const vcapenv = require('abacus-vcapenv');
const perf = require('abacus-perf');
const hystrix = require('abacus-hystrix');
const eureka = require('abacus-eureka');
const cp = require('child_process');
const commander = require('commander');
const rc = require('abacus-rc');

const wrap = _.wrap;

// Setup debug log
const debug = require('abacus-debug')('abacus-webapp');

// Configure a clustered Express-based Web app
//
// Use like this:
// const app = webapp();
// app.listen();
const webapp = () => {
  // Determine the app name
  const appname = vcapenv.appname();
  debug('Creating app %s', appname);

  // Create the app
  const app = cluster(express());

  // Configure the app to report its app instance id and instance index
  app.use(vcapenv.headers());

  // Monkey patch the app listen function to register some of our middleware
  // after the app's middleware
  app.listen = wrap(app.listen, (listen, opt) => {
    app.use(hystrix.stream());
    app.use(eureka.health());

    // Call the original app listen function
    debug('Listening');
    const server = listen.call(app, opt);

    // Optionally register the app instance in a Eureka registry
    if(cluster.isMaster() && eureka())
      eureka.register(
        eureka(), appname, vcapenv.appindex(), vcapenv.iindex(),
        vcapenv.iaddress(), vcapenv.iport() || server.address().port,
        (err, val) => {
          if(err)
            debug('Couldn\'t register app %s in Eureka registry, %o',
              appname, err);
          else
            debug('Registered app %s in Eureka registry', appname);
        });

    return server;
  });

  return app;
};

// Return a clustered basic Express app
const basic = () => {
  return cluster(express.basic());
};

// Let the Express module send messages to the cluster master
express.on('message', cluster.onMessage);

// Broadcast perf stat messages across the cluster. Only need to do that
// if we have more than one worker in the cluster.
if(cluster.size() > 1) {
  debug('Broadcasting perf stat messages across the cluster');
  cluster.on('message', perf.onMessage);
  perf.on('message', cluster.onMessage);
}

// Set default port and host name, command line has higher priority then
// the existing env, then rc files
const conf = () => {
  process.env.PORT = commander.port || process.env.PORT || 9080;
  if(commander.host)
    process.env.HOST = commander.host;
};

// Command line interface
const runCLI = () => {
  // Parse command line options
  commander
    .option('-p, --port <port>', 'port number [9080]')
    .option('-h, --host <hostname>', 'host name [*]')
    .option('start', 'start the server')
    .option('stop', 'stop the server')
    .parse(process.argv);

  // Load env from rc file
  rc();

  // Start a Webapp
  if(commander.start) {
    conf();

    // Run the app CLI
    const app = require(process.cwd());
    if(app && app.runCLI)
      app.runCLI();
  }
  else if(commander.stop)
    // Stop the Webapp
    cp.exec('pkill -f "node ' + vcapenv.appname() + '.* master"',
      (err, stdout, stderr) => {
        if(err) debug('Stop error %o', err);
      });
};

// Export our public functions
module.exports = webapp;
module.exports.basic = basic;
module.exports.runCLI = runCLI;

