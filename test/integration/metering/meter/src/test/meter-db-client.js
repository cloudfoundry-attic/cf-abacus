'use strict';

const util = require('util');

const dbClient = require('abacus-dbclient');
const partition = require('abacus-partition');

// TODO package
const buildKeyFn = (usageDoc) => {
  const keyFields = [
    't',
    dbClient.pad16(usageDoc.end),
    'k',
    usageDoc.organization_id,
    usageDoc.space_id,
    usageDoc.consumer_id,
    usageDoc.resource_id,
    usageDoc.plan_id,
    usageDoc.resource_instance_id
  ];

  if(usageDoc.dedup_id)
    keyFields.push(usageDoc.dedup_id);

  return keyFields.join('/');
};

module.exports = (dbPartitions) => {
  const partitioner = partition.partitioner(
    partition.bucket,
    partition.period,
    partition.createForwardFn(dbPartitions, 4000),
    partition.balance,
    true
  );
  const errorDb = dbClient(partitioner, dbClient.dburi('mongodb://localhost:27017', 'abacus-business-errors'));
  const outputDb = dbClient(partitioner, dbClient.dburi('mongodb://localhost:27017', 'abacus-meter'));

  const errorGet = util.promisify(errorDb.get);
  const outputGet = util.promisify(outputDb.get);

  return {
    error: {
      get: (usageDoc) => errorGet(buildKeyFn(usageDoc))
    },
    output: {
      get: (usageDoc) => outputGet(buildKeyFn(usageDoc))
    }
  };
};
