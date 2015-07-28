'use strict';

// A test CouchDB server app built using Express and PouchDB

const _ = require('underscore');
const pouchdb = require('pouchdb');
const memdown = require('memdown');
const expouchdb = require('express-pouchdb');
const webapp = require('cf-abacus-webapp');
const cluster = require('cf-abacus-cluster');
const cp = require('child_process');

const wrap = _.wrap;

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-dbserver');

// Return an Express app configured to work as a PouchDB server
const pouchdbapp = (dbopt) => {

    // Configure Node cluster to use a single CPU as PouchDB / LevelDB is not a
    // multi-process db
    cluster.single();

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

// Command line interface
const runCLI = () => {

    // Start DB server
    if(process.argv[2] === 'start') {
        if(!process.env.PORT && process.argv[3])
            process.env.PORT = process.argv[3];

        // Create the PouchDB app and listen on the configured port
        const app = pouchdbapp({ db: memdown });
        app.listen(process.env.PORT ? parseInt(process.env.PORT) : 5984);
    }
    // Stop DB server
    else if(process.argv[2] === 'stop')
        cp.exec('module=`cat package.json | grep \'"name"\' | awk -F \'"\' \'{ print $4 }\'`; pkill -f "node $module$"; pkill -f "node $module "', (err, stdout, stderr) => {
            if(err) debug('Stop error %o', err);
        });
};

// Export our public functions
module.exports = pouchdbapp;
module.exports.runCLI = runCLI;

