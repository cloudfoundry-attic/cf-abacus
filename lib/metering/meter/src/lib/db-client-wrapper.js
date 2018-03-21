'use strict';

const util = require('util');
const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-meter-db-client');

const storeDocument = (doc, dbClient) => {
  debug('Storing document %o', doc);
  return dbClient.put(extend({}, doc, { _id: dbClient.buildId(doc) }));
};

const getDocument = (id, dbClient) => dbClient.get(id);

module.exports = (db, buildIdFn) => {
  const dbClient = {
    get: util.promisify(db.get),
    put: util.promisify(db.put),
    buildId: buildIdFn
  };
  return {
    put: (usageDoc) => storeDocument(usageDoc, dbClient),
    get: (id) => getDocument(id, dbClient)
  };
};
