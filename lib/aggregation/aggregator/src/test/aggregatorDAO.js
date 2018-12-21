'use strict';

const util = require('util');
const { map } = require('underscore');

const moment = require('abacus-moment');
const partition = require('abacus-partition');
const dbclient = require('abacus-dbclient');

const { outputKeys, inputKey } = require('../lib/keys');

const forward = (n) => partition.createForwardFn(n, 4000);

const dbpartitions = (n) => n ? n : process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : 1;

const dbpartition = (n) =>
  partition.partitioner(partition.bucket, partition.period, forward(dbpartitions(n)), partition.balance);

const outputDAO = 
  dbclient(dbpartition(), dbclient.dburi('mongodb://localhost:27017', 'abacus-aggregator-aggregated-usage'));
const findAllOutputDocs = util.promisify(outputDAO.allDocs);


const inputDAO = 
dbclient(dbpartition(), dbclient.dburi('mongodb://localhost:27017', 'abacus-aggregator-accumulated-usage'));
const findInputDoc = util.promisify(inputDAO.allDocs);

const outputDocs = async(usage) => {
  const endTime = moment.utc(usage.start).startOf('month').valueOf();
  const startTime = moment.utc(usage.end).endOf('month').valueOf();

  const queries = map(outputKeys(usage), (key) => findAllOutputDocs({
    endkey: dbclient.kturi(key, endTime),
    startkey: dbclient.kturi(key, startTime) + 'ZZZ',
    descending: true,
    limit: 1,
    include_docs: true
  }));

  const results = await Promise.all(queries);
  if(results[0].rows.length === 0) 
    return [];
  return map(results, (result) => dbclient.undbify(result.rows[0].doc));
};

const inputDoc = async(usage) => {
  const endTime = moment.utc(usage.end).startOf('month').valueOf();
  const startTime = moment.utc(usage.end).endOf('month').valueOf();

  const result = await findInputDoc({
    endkey: dbclient.tkuri(inputKey(usage), endTime),
    startkey: dbclient.tkuri(inputKey(usage), startTime) + 'ZZZ',
    descending: true,
    limit: 1,
    include_docs: true
  });
  
  return dbclient.undbify(result.rows[0].doc);
};


module.exports = {
  inputDoc,
  outputDocs
};

