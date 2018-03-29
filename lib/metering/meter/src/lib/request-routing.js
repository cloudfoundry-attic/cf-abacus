'use strict';

const partition = require('abacus-partition');
const dbClient = require('abacus-dbclient');
const seqid = require('abacus-seqid');
const url = require('url');
const util = require('util');

const forward = (n) => partition.createForwardFn(n, 4000);

// Assemble bucket, period, forward and balance conversion functions into
// a custom sink partitioning function
const sinkpartition = (n) => {
  const sp = n ? n : process.env.SINK_APPS ? parseInt(process.env.SINK_APPS) : 1;
  return sp > 1
    ? partition.partitioner(partition.bucket, partition.period, forward(sp), partition.balance)
    : partition.nopartition;
};

const partitionUri = (appUri, partition, numOfApps) => {
  // If there's no partitioning just return the configured sink host
  if (!partition) return appUri;

  // Map the sink host the URI of the app allocated to the target partition
  const u = url.parse(appUri);

  const t = {};
  t.protocol = u.protocol;
  if (u.port) {
    // Add the partition number to the sink host port number
    t.port = parseInt(u.port) + parseInt(partition[0]);
    t.hostname = u.hostname;
    // debug('Mapping partition %o to port %s', p, u.port);
  } else
    // Add the partition number to the sink host name
    t.host = u.host.replace(/([^.]+)(.*)/, '$1-' + partition[0] + '$2');
  // debug('Mapping partition %o to hostname %s', p, u.host);


  // Format the target sink URI
  const surl = url.format(t);
  // debug('Target sink uri %s, partition %o', surl, p);
  return surl;
};

const getUri = async(uri, usageDoc, numOfApps) => {
  const ikey = (udoc) =>
    [udoc.organization_id, udoc.resource_instance_id, udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/');
  const itime = (udoc) => seqid();
  const partitionFn = util.promisify(sinkpartition(numOfApps));
  const id = dbClient.kturi(ikey(usageDoc), itime(usageDoc));
  const partition = await partitionFn(dbClient.k(id), dbClient.t(id), 'write');
  return partitionUri(uri, partition, numOfApps);
};

module.exports = (numOfApps) => (uri, doc) => getUri(uri, doc, numOfApps);


