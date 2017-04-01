'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

// Load specific implementation module
const dbClient = require(process.env.DBCLIENT || 'abacus-couchclient');

// Extend the concrete implementation to the defined API
const dbCommons = require('abacus-dbcommons')(dbClient);
dbClient.tkuri = dbCommons.tkuri;
dbClient.kturi = dbCommons.kturi;
dbClient.k = dbCommons.k;
dbClient.t = dbCommons.t;
dbClient.dbify = dbCommons.dbify;
dbClient.undbify = dbCommons.undbify;
dbClient.pad16 = dbCommons.pad16;

// Export the configured db client
module.exports = dbClient;
