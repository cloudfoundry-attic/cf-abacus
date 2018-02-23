'use strict';

const moment = require('abacus-moment');
const util = require('util');
const keyFn = require('abacus-dbclient').tkuri;

const buildKey = (usage) =>
  keyFn(
    util.format(
      '%s/%s/%s/%s/%s/%s',
      usage.organization_id,
      usage.space_id,
      usage.consumer_id,
      usage.resource_id,
      usage.plan_id,
      usage.resource_instance_id
    ),
    moment
      .utc(usage.start)
      .startOf('month')
      .valueOf()
  );

const storeDocument = (usageDoc, error, db) => {
  const doc = {
    _id: buildKey(usageDoc),
    doc: usageDoc,
    error: error
  };
  console.log('>>>>> PUT');
  return db.put(doc);
};

const getDocument = (key, db) => {
  return db.get(key);
};

module.exports = (errorDb) => {
  return {
    store: (usageDoc, error) => storeDocument(usageDoc, error, errorDb),
    get: (key) => getDocument(key, errorDb)
  };
};
