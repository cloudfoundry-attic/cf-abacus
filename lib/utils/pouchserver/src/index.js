'use strict';

// A test CouchDB server app built using Express and PouchDB

const _ = require('underscore');
const pouchdb = require('pouchdb');
const memdown = require('memdown');
const expouchdb = require('express-pouchdb');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const cp = require('child_process');
const commander = require('commander');

const wrap = _.wrap;

// Setup debug log
const debug = require('abacus-debug')('abacus-pouchserver');

// Return an Express app configured to work as a PouchDB server
const pouchserver = (dbopt) => {

  // Configure Node cluster to use a single CPU as PouchDB / LevelDB is not a
  // multi-process db
  cluster.singleton();

  // Create an Express Web app
  const app = webapp.basic();

  // Monkey patch the app.listen() method to add the PouchDB server
  // middleware last, after the app middleware
  app.listen = wrap(app.listen, (listen, opt) => {
    if(cluster.isWorker()) {

      /*
      app.use('/', (req, res, next) => {
          // Intercept session read-writes to prevent that a previously
          // established session be wiped out and replaced by the PouchDB
          // session
          const s = req.session || {};
          Object.defineProperty(req, 'session', {
              set: (v) => extend(s, v),
              get: () => s
          });
          next();
      });
      */

      // Use the PouchDB server middleware
      debug('Initializing database');
      app.use('/', expouchdb(pouchdb.defaults(dbopt ? dbopt : {})));
    }

    // Call the original app listen function
    return listen.call(app, opt);
  });

  return app;
};

// Set default port and host name, command line has higher priority then
// the existing env, then rc files
const conf = () => {
  process.env.PORT = commander.port || process.env.PORT || 5984;
  if(commander.host)
    process.env.HOST = commander.host;
};

// Command line interface
const runCLI = () => {

  // Parse command line options
  commander
    .option('-p, --port <port>', 'port number [5984]')
    .option('-h, --host <hostname>', 'host name [*]')
    .option('start', 'start the server')
    .option('stop', 'stop the server')
    .parse(process.argv);

  // Start DB server
  if(commander.start) {
    conf();

    // Create PouchDB app and listen on the configured port
    const app = pouchserver({
      db: memdown
    });
    app.listen({
      port: parseInt(process.env.PORT),
      hostname: process.env.HOST
    });

  }
  else if (commander.stop)
    // Stop DB server
    cp.exec('pkill -f "node abacus-pouchserver"',
      (err, stdout, stderr) => {
        if(err) debug('Stop error %o', err);
      });
};

// Export our public functions
module.exports = pouchserver;
module.exports.runCLI = runCLI;

