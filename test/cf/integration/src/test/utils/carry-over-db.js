'use strict';

const omit = require('underscore').omit;
const extend = require('underscore').extend;

const dbClient = require('abacus-dbclient');
const moment = require('abacus-moment');
const lifecycleManager = require('abacus-lifecycle-manager')();
const partition = require('abacus-partition');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');

const createWait = require('abacus-wait');

const checkKeyPart = partition.partitioner(
  partition.bucket,
  partition.period,
  partition.forward,
  partition.balance,
  true
);

const dbalias = process.env.DBALIAS || 'db';
const uris = urienv({
  [dbalias]: 5984
});

const db = dbClient(checkKeyPart, dbClient.dburi(uris[dbalias], 'abacus-carry-over'));
const getAllDocs = yieldable(db.allDocs);
const putDoc = yieldable(db.put);
const drop = yieldable(dbClient.drop);
const waitUntil = yieldable(createWait().until);

const readCurrentMonthDocs = function*(cb) {
  const monthStart = moment
    .utc(moment.now())
    .startOf('month')
    .valueOf();
  const monthEnd = moment
    .utc(moment.now())
    .endOf('month')
    .valueOf();
  const result = yield getAllDocs({
    startkey: 't/' + seqid.pad16(monthStart),
    endkey: 't/' + seqid.pad16(monthEnd),
    descending: false,
    include_docs: true
  });

  const docs = result.rows.map((row) => omit(row.doc, '_rev', '_id'));
  return docs;
};

const put = function*(doc) {
  yield putDoc(
    extend({}, doc, {
      _id: dbClient.tkuri(doc.event_guid, doc.timestamp)
    })
  );
};

const isDbAvailable = function*() {
  try {
    yield readCurrentMonthDocs();
    return true;
  } catch (error) {
    return false;
  }
};

const setup = function*() {
  if (!process.env.DB) 
    lifecycleManager.startModules([lifecycleManager.modules.pouchserver]);
  else 
    yield drop(process.env.DB, /^abacus-/);

  yield waitUntil(isDbAvailable);
};

const teardown = () => {
  if (!process.env.DB) lifecycleManager.stopAllStarted();
};

module.exports.readCurrentMonthDocs = readCurrentMonthDocs;
module.exports.put = put;
module.exports.setup = setup;
module.exports.teardown = teardown;
