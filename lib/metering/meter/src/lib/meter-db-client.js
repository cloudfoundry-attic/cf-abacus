'use strict';

// const moment = require('abacus-moment');
// const util = require('util');
// const keyFn = require('abacus-dbclient').tkuri;

const debug = require('abacus-debug')('abacus-usage-meter-db-client');

const storeDocument = (usageDoc, error, dbClient) => {
  const doc = {
    _id: dbClient.buildKey(usageDoc),
    doc: usageDoc,
    error: error ? error : undefined
  };
  debug('Storing errored document %o', doc);
  return dbClient.put(doc);
};

// const getDocument = (key, db) => db.get(key);

module.exports = (dbClient) => {
  return {
    put: (usageDoc, error) => storeDocument(usageDoc, error, dbClient),
    get: (key) => getDocument(key, dbClient)
  };
};

