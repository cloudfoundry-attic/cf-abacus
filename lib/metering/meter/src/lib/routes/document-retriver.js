'use strict';

const debug = require('abacus-debug')('abacus-usage-metering-document-retriever');

const { pick, map, pairs } = require('underscore');
const usageSchemas = require('abacus-usage-schemas');

const resourceUsageSchemaProperties = map(pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);
resourceUsageSchemaProperties.push('error');

// NB: collectorDb param should be removed after retention period
const retrieve = async(id, meterOutputDb, errorDb, collectorDb) => {
  let doc;

  debug('Retrieving document id %s', id);
  doc = await meterOutputDb.get(id);

  // Remove below queries after retention period
  if (!doc) {
    debug('Document not found in output DB, searching in collector db', id);
    doc = await collectorDb.get(id);
  }
  // end remove

  if(!doc) {
    debug('Document not found in collector DB, searching in error db', id);
    doc = await errorDb.get(id);
  }

  return pick(doc, resourceUsageSchemaProperties);
};

module.exports = (outputDb, errorDb, collectorDb) => ({
  retrieve: (key) => retrieve(key, outputDb, errorDb, collectorDb)
});
