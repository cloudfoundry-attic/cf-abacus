'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.
// Also sets up some call perf metrics collection across the cluster.

const _ = require('underscore');
const express = require('abacus-express');
const cluster = require('abacus-cluster');
const vcap = require('abacus-vcapenv');
const perf = require('abacus-perf');
const hystrix = require('abacus-hystrix');
const cp = require('child_process');
const commander = require('commander');

const wrap = _.wrap;

// Setup debug log
const debug = require('abacus-debug')('abacus-webapp');

// Configure a clustered Express-based Web app
//
// Use like this:
// const app = webapp();
// app.listen();
const webapp = () => {
  const app = cluster(express());

  // Configure the app to report its app instance id and instance index
  app.use(vcap.headers());

  // Monkey patch the app listen function to register some of our middleware
  // after the app's middleware
  app.listen = wrap(app.listen, (listen, opt) => {
    app.use(hystrix.stream());

    // Call the original app listen function
    return listen.call(app, opt);
  });

  return app;
};

// Return a clustered basic Express app
const basic = () => {
  return cluster(express.basic());
};

// Let the Express module send messages to the cluster master
express.on('message', cluster.onMessage);

// Pass cluster messages to the perf module
cluster.on('message', perf.onMessage);

// Let the perf module send messages to the cluster master
perf.on('message', cluster.onMessage);

// Command line interface
const runCLI = () => {
  // Parse command line options
  commander
    .option('-p, --port <port>', 'port number [9080]', '9080')
    .option('start', 'start the server')
    .option('stop', 'stop the server')
    .parse(process.argv);

  // Start a Webapp
  if(commander.start) {
    if(!process.env.PORT && commander.port)
      process.env.PORT = commander.port;
    const app = require(process.cwd());
    if(app && app.runCLI)
      app.runCLI();
  }
  else if(commander.stop)
    // Stop a Webapp
    cp.exec('module=`cat package.json | grep \'"name"\' | awk -F \'"\' ' +
      '\'{ print $4 }\'`; pkill -f "node $module$"; pkill -f "node $module "',
      (err, stdout, stderr) => {
        if(err) debug('Stop error %o', err);
      });
};

// Export our public functions
module.exports = webapp;
module.exports.basic = basic;
module.exports.runCLI = runCLI;

