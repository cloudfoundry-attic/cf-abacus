'use strict';

const debug = require('abacus-debug')('abacus-usage-metering-document-retriever');

const { pick, map, pairs } = require('underscore');
const usageSchemas = require('abacus-usage-schemas');

const resourceUsageSchemaProperties = map(pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);
resourceUsageSchemaProperties.push('error');

const retrieve = async(id, outputDb, errorDb) => {
  let doc;

  debug('Retrieving document id %s', id);
  doc = await outputDb.get(id);

  if(!doc) {
    debug('Document not found in output DB, searching in error db', id);
    doc = await errorDb.get(id);
  }

  return pick(doc, resourceUsageSchemaProperties);
};

module.exports = (outputDb, errorDb) => ({
  retrieve: (key) => retrieve(key, outputDb, errorDb)
});
