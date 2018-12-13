'use strict';

const util = require('util');

const dbClient = require('abacus-dbclient');
const partition = require('abacus-partition');
const docid = require('abacus-docid');

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
      get: (usageDoc) => errorGet(docid.createMeterId(usageDoc))
    },
    output: {
      get: (usageDoc) => outputGet(docid.createMeterId(usageDoc))
    }
  };
};
