'use strict';

const omit = require('underscore').omit;

const dbClient = require('abacus-dbclient');
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');


const checkKeyPart = partition.partitioner(partition.bucket,
  partition.period, partition.forward, partition.balance, true);

const dbalias = process.env.DBALIAS || 'db';
const uris = urienv({
  [dbalias]  : 5984
});

const db = dbClient(checkKeyPart, dbClient.dburi(uris[dbalias], 'abacus-carry-over'));
const getAllDocs = yieldable(db.allDocs);

const readCurrentMonthDocs = function *(cb) {

  // const monthStart = seqid.pad16(moment.utc(usageEventData.createdAt).startOf('month').valueOf());
  // const docKey = [
  //   't', monthStart,
  //   'k', usageEventData.orgGuid, usageEventData.spaceGuid,
  //   'service:' + usageEventData.serviceInstanceGuid, usageEventData.serviceLabel, usageEventData.servicePlanName,
  //   'service:'].join('/') + [
  //     usageEventData.serviceInstanceGuid,
  //     usageEventData.servicePlanName,
  //     usageEventData.serviceLabel].join(':');


  const monthStart = moment.utc(moment.now()).startOf('month').valueOf();
  const result = yield getAllDocs({
    startkey: 't/' + seqid.pad16(moment.utc(monthStart).subtract(1, 'days').valueOf()),
    endkey: 't/' + seqid.pad16(moment.utc(monthStart).add(1, 'days').valueOf()),
    descending: false,
    include_docs: true
  });



  const docs = result.rows.map((row) => omit(row.doc, '_rev', '_id'));
  return docs;
  // db.allDocs({
  //   keys: [docKey],
  //   descending: false,
  //   include_docs: true
  // }, (err, result) => {
  //   if (err)
  //     cb(err);

  //   const docs = result.rows.map((row) => omit(row.doc, '_rev', '_id'));

  //   cb(undefined, docs);
};


module.exports.readCurrentMonthDocs = readCurrentMonthDocs;
