'use strict';

const seqid = require('abacus-seqid');
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const dbclient = require('abacus-dbclient');
const util = require('util');
const { map } = require('underscore');
const forward = (n) => partition.createForwardFn(n, 4000);

// Return the configured number of db partitions to use
const dbpartitions = (n) => n ? n : process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : 1;

// Assemble bucket, period, forward and balance conversion functions into
// a custom db partitioning function
const dbpartition = (n) =>
  partition.partitioner(partition.bucket, partition.period, forward(dbpartitions(n)), partition.balance);

const otimes = (sampling) => (udoc, itime) => [
  seqid.sample(itime, sampling),
  seqid.sample(itime, sampling),
  seqid.sample(itime, sampling),
  map([udoc.end, udoc.start], seqid.pad16).join('/')
];


const dao = dbclient(dbpartition(), dbclient.dburi('mongodb://localhost:27017', 'abacus-aggregator-aggregated-usage'));
const findAllDocs = util.promisify(dao.allDocs);
console.log('============>', dao);
const okeys = (udoc, ikey) => {
  const orgAggregationKey = udoc.organization_id;
  const consumerAggregationKey = [udoc.organization_id, udoc.space_id, udoc.consumer_id || 'UNKNOWN'];
  const spaceAggregationKey = [udoc.organization_id, udoc.space_id];
  const markerDocKey = [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.plan_id,
    udoc.metering_plan_id,
    udoc.rating_plan_id,
    udoc.pricing_plan_id
  ];

  if(udoc.dedup_id)
    markerDocKey.push(udoc.dedup_id);

  return [
    orgAggregationKey,
    consumerAggregationKey.join('/'),
    spaceAggregationKey.join('/'),
    markerDocKey.join('/')
  ];
};

const itime = (udoc) => {
  const docTime = udoc.end;
  if (docTime < moment.utc().startOf('month'))
    return lastMonthId(docTime);
  return seqid();
};

const findAggregatorDocs = async(usage) => {
  const t = parseInt(otimes(process.env.SAMPLING)(usage, itime(usage)));
  const endTime = moment.utc(t).startOf('month').valueOf();
  const startTime = moment.utc(t).endOf('month').valueOf();

  const queries = map(okeys(usage), (key) => findAllDocs({
    endkey: dbclient.kturi(key, endTime),
    startkey: dbclient.kturi(key, startTime) + 'ZZZ',
    descending: true,
    limit: 1,
    include_docs: true
  }));
  
  return map(await Promise.all(queries), (result) => dbclient.undbify(result.rows[0].doc));
};

module.exports = {
  findAggregatorDocs
};


