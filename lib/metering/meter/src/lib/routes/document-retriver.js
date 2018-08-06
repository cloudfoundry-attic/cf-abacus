'use strict';

const debug = require('abacus-debug')('abacus-usage-metering-document-retriever');

const { pick, map, pairs } = require('underscore');

const usageSchemas = require('abacus-usage-schemas');
const { t, k, tkuri } = require('abacus-dbcommons')();

const resourceUsageSchemaProperties = map(pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);
resourceUsageSchemaProperties.push('error');

// TODO: Remove below queries once dbs are obsolete (after Oct 2018) !!!
const getObsoleteDocument = async(id, meterOutputDb, collectorDb,
  meterOutputDbDefaultPartitioner, errorDbDefaultPartitioner) => {
  let doc;

  const time = t(id);
  const key = k(id);
  if (key && time) {
    const fixedId = tkuri(key, time);
    debug('Retrieving document with padded timestamp id %s', fixedId);
    doc = await meterOutputDb.get(fixedId);
  }

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

  return doc;
};

// TODO: call to getObsoleteDocument should be removed after retention period (Oct 2018) !!!
const retrieve = async(id, meterOutputDb, errorDb, collectorDb, meterOutputDbDefaultPartitioner,
  errorDbDefaultPartitioner) => {
  let doc;

  debug('Retrieving document id %s', id);
  doc = await meterOutputDb.get(id);

  if (!doc)
    doc = await getObsoleteDocument(id, meterOutputDb, collectorDb,
      meterOutputDbDefaultPartitioner, errorDbDefaultPartitioner);

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
