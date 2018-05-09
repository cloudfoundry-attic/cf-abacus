'use strict';

const dbClient = require('abacus-dbclient');
const seqid = require('abacus-seqid');

const url = require('url');
const util = require('util');

const partitionUri = (appUri, partitionNumber) => {
  const originalUrl = url.parse(appUri);

  const partitionedUrl = originalUrl.port ? {
    protocol: originalUrl.protocol,
    port: parseInt(originalUrl.port) + parseInt(partitionNumber),
    hostname: originalUrl.hostname
  } : {
    protocol: originalUrl.protocol,
    hostname: originalUrl.hostname.replace(/([^.]+)(.*)/, '$1-' + partitionNumber + '$2')
  };

  return url.format(partitionedUrl);
};

const buildKey = (udoc) =>
  [udoc.organization_id, udoc.resource_instance_id, udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/');

const getPartitionNumber = (partitionData) => partitionData[0];

const getUri = async(uri, usageDoc, partitioner) => {
  const partitionData = await partitioner(buildKey(usageDoc), dbClient.pad16(seqid()), 'write');

  if (!partitionData)
    return uri;

  return partitionUri(uri, getPartitionNumber(partitionData));
};

module.exports = (partition, numOfApps, uri) => {

  const sinkpartition = (n) => {
    const sp = n ? n : process.env.SINK_APPS ? parseInt(process.env.SINK_APPS) : 1;
    const forward = (n) => partition.createForwardFn(n, 4000);
    return sp > 1
      ? partition.partitioner(partition.bucket, partition.period, forward(sp), partition.balance)
      : partition.nopartition;
  };

  const partitioner = util.promisify(sinkpartition(numOfApps));

  return {
    getUri: (doc) => getUri(uri, doc, partitioner)
  };
};


