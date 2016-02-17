'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

// Export the configured dbclient implementation module
module.exports = require(process.env.DBCLIENT || 'abacus-couchclient');

