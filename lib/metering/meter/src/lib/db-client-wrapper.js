'use strict';

const util = require('util');
const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-metering-db-client');
const edebug = require('abacus-debug')('e-abacus-usage-metering-db-client');

const duplicateDocumentErrorCode = 409;

const storeDocument = async(doc, dbClient) => {
  debug('Storing document %o', doc);
  try {
    await dbClient.put(extend({}, doc, { _id: dbClient.buildId(doc) }));
  } catch(err) {
    edebug('Error writing into error DB: %o', err);
    if(err.status !== duplicateDocumentErrorCode)
      throw err;
  }
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
