'use strict';

const omit = require('underscore').omit;
const dbClient = require('abacus-dbclient');
const moment = require('abacus-moment');
const lifecycleManager = require('abacus-lifecycle-manager')();
const partition = require('abacus-partition');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
const util = require('util');

const checkKeyPart = partition.partitioner(
  partition.bucket,
  partition.period,
  partition.forward,
  partition.balance,
  true
);

const uris = urienv({
  db_uri: 'mongodb://localhost:27017'
});

const db = dbClient(checkKeyPart, dbClient.dburi(uris.db_uri, 'abacus-carry-over'));
const getAllDocs = util.promisify(db.allDocs);
const putDoc = util.promisify(db.put);
const drop = util.promisify(dbClient.drop);

const readCurrentMonthDocs = async () => {
  const monthStart = moment
    .utc(moment.now())
    .startOf('month')
    .valueOf();
  const monthEnd = moment
    .utc(moment.now())
    .endOf('month')
    .valueOf();
  const result = await getAllDocs({
    startkey: 't/' + seqid.pad16(monthStart),
    endkey: 't/' + seqid.pad16(monthEnd),
    descending: false,
    include_docs: true
  });

  const docs = result.rows.map((row) => omit(row.doc, '_rev', '_id'));
  return docs;
};

const put = async (doc) => {
  if (!doc._id)
    doc._id = dbClient.tkuri(doc.event_guid, doc.timestamp);

  await putDoc(doc);
};

const isDbAvailable = async () => {
  await readCurrentMonthDocs();
};

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

const setup = async () => {
  await drop(dbEnv, /^abacus-/);
  await eventually(isDbAvailable);
};

const teardown = () => {
  if (!process.env.DB_URI)
    lifecycleManager.stopAllStarted();
};

module.exports.readCurrentMonthDocs = readCurrentMonthDocs;
module.exports.put = put;
module.exports.setup = setup;
module.exports.teardown = teardown;
