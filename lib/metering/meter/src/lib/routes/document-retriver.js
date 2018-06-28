'use strict';

const debug = require('abacus-debug')('abacus-usage-metering-document-retriever');

const { pick, map, pairs } = require('underscore');
const usageSchemas = require('abacus-usage-schemas');

const resourceUsageSchemaProperties = map(pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);
resourceUsageSchemaProperties.push('error');

// NB: collectorDb param should be removed after retention period
const retrieve = async(id, meterOutputDb, errorDb, collectorDb, meterOutputDbDefaultPartitioner,
  errorDbDefaultPartitioner) => {
  let doc;

  debug('Retrieving document id %s', id);
  doc = await meterOutputDb.get(id);

  // {{ Remove below queries once meterOutputDbDefaultPartitioner and errorDbDefaultPartitioner are removed
  if(!doc) {
    debug('Document not found in meter DB, searching in output db', id);
    doc = await meterOutputDbDefaultPartitioner.get(id);
  }

  if(!doc) {
    debug('Document not found in default partitioner meter DB, searching in error db', id);
    doc = await errorDbDefaultPartitioner.get(id);
  }

  if (!doc) {
    debug('Document not found in error DB (default partitioner), searching in collector db', id);
    doc = await collectorDb.get(id);
  }
  // }} end remove

  if(!doc) {
    debug('Document not found in meter DB, searching in error db', id);
    doc = await errorDb.get(id);
  }

  return pick(doc, resourceUsageSchemaProperties);
};

module.exports = (outputDb, errorDb, collectorDb, meterOutputDbDefaultPartitioner, errorDbDefaultPartitioner) => ({
  retrieve: (key) => retrieve(key, outputDb, errorDb, collectorDb,
    meterOutputDbDefaultPartitioner, errorDbDefaultPartitioner)
});
