'use strict';

const debug = require('abacus-debug')('abacus-usage-metering-document-retriever');

const { pick, map, extend, pairs } = require('underscore');

const usageSchemas = require('abacus-usage-schemas');

const resourceUsageSchemaProperties = map(pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);

const retrieve = async(id, meterOutputDb, errorDb) => {
  debug('Retrieving document id %s', id);
  let storedDoc = await meterOutputDb.get(id);

  if(!storedDoc) {
    debug('Document not found in meter DB, searching in error db', id);
    storedDoc = await errorDb.get(id);
  }

  if (!storedDoc)
    return {};

  const usageDoc = storedDoc.usageDoc ? storedDoc.usageDoc : storedDoc;
  const document = pick(usageDoc, resourceUsageSchemaProperties);
  return storedDoc.error ? extend({}, document, { error: storedDoc.error }) : document;
};

module.exports = (outputDb, errorDb) => ({
  retrieve: (key) => retrieve(key, outputDb, errorDb)
});
