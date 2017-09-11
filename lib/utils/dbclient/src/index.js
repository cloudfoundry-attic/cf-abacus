'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

// Load specific implementation module
const dbClient = require(process.env.DBCLIENT || 'abacus-couchclient');

// Customize DB commons module with DB client specific options (i.e. omit_id)
const dbCommons = require('abacus-dbcommons')(dbClient);

// Extend the concrete implementation to the defined API
dbClient.tkuri = dbCommons.tkuri;
dbClient.kturi = dbCommons.kturi;
dbClient.k = dbCommons.k;
dbClient.t = dbCommons.t;
dbClient.dbify = dbCommons.dbify;
dbClient.undbify = dbCommons.undbify;
dbClient.pad16 = dbCommons.pad16;
dbClient.readAllPages = (opt, cb) => dbCommons.readAllPages(dbclient, opt, cb);

// Export the configured db client
module.exports = dbClient;
