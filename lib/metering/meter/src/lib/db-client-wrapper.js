'use strict';

const util = require('util');

const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-metering-db-client');

const duplicateDocumentErrorCode = 409;

const storeDocument = async(inputDoc, dbClient) => {
  const usageDoc = inputDoc.usageDoc ? inputDoc.usageDoc : inputDoc;
  debug('Storing document %o', usageDoc);
  try {
    await dbClient.put(extend({}, inputDoc, { _id: dbClient.buildId(usageDoc) }));
  } catch(err) {
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
    put: (inputDoc) => storeDocument(inputDoc, dbClient),
    get: (id) => getDocument(id, dbClient),
    buildId: buildIdFn
  };
};
