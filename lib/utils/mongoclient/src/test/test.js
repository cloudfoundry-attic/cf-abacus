'use strict';

// Small utility that provides a subset of the MongoDB API over a set of DB
// partitions

const _ = require('underscore');
const sample = _.sample;

const partition = require('abacus-partition');
const batch = require('abacus-batch');
const dbclient = require('..');
const https = require('https');
const path = require('path');
const fs = require('fs');

/* eslint handle-callback-err: 0 */

const dbserver = () => process.env.DB;
const debug = require('abacus-debug')('abacus-mongoclient-test');

describe('abacus-mongoclient', () => {
  const helloKey = dbclient.kturi('Hello', Date.parse(
    'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'));
  const helloAgainKey = dbclient.kturi('Hello', Date.parse(
    'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)'));
  const heyKey = dbclient.tkuri('Hey', Date.parse(
    'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'));
  const blahKey = dbclient.kturi('Blah', Date.parse(
    'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'));
  const awwwwKey = dbclient.kturi('Awwww', Date.parse(
    'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'));

  const oldMongoOpts = process.env.MONGO_OPTS;

  before(function(done) {
    if (!process.env.DBCLIENT ||
      process.env.DBCLIENT !== 'abacus-mongoclient') {
      console.log('  Skipping mongoclient tests. DBCLIENT set to',
        process.env.DBCLIENT || 'default');
      this.skip();
      done();
    }

    // Delete test dbs on the configured db server
    dbclient.drop(dbserver(), /^abacus-mongoclient-/, done);
  });

  after(() => {
    process.env.MONGO_OPTS = oldMongoOpts;
  });

  it('distributes db operations over several db partitions', (done) => {

    // Setup a partitioned db
    // Use a custom partition function causing some errors to help test
    // error handling. That complicates the setup a bit.
    //
    // Without that error test code, a normal setup would look like this:
    // const db = dbclient(partition, function(p) { return ['testdb',
    // p.join('-')].join('-'); }, function(uri, opt, cb) {
    //   cb(undefined, new mongoDB(uri, { db: memdown }));
    // });
    //
    const berr = new Error('Can\'t load balance DB partition 3');
    const perr = new Error('Can\'t open DB partition 2-201411');
    const db = dbclient(partition.partitioner(
      partition.bucket, partition.period, partition.forward, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }), dbclient.dburi(dbserver(),
        'abacus-mongoclient-test'), (uri, opt, cb) => {
          // Cause DB handler errors on DB partition 2-201411
          return /mongoclient-test-2-201411/.test(uri) ? cb(perr) :
            dbclient.dbcons(uri, opt, cb);
        });

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      debug('several partitions: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('several partitions: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Put some docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const put = (done) => {
      debug('several partitions: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('several partitions: put finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: helloAgainKey,
        value: 'Hello again'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: heyKey,
        value: 'Hey'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: blahKey,
        value: 'Blah'
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.put({
        id: awwwwKey,
        value: 'Awwww'
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Put same docs to verify we are not doing upsert
    const putAgain = (done) => {
      debug('several partitions: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('several partitions: put finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.not.equal(null)));
      db.put({
        id:helloAgainKey,
        value: 'Hello again'
      }, (err, doc) => cb(expect(err).to.not.equal(null)));
      db.put({
        id: heyKey,
        value: 'Hey'
      }, (err, doc) => cb(expect(err).to.not.equal(null)));
      db.put({
        id: blahKey,
        value: 'Blah'
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.put({
        id: awwwwKey,
        value: 'Awwww'
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Get the docs back from the db
    let hellodoc;
    let hello2doc;
    let heydoc;
    const get = (done) => {
      debug('several partitions: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('several partitions: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1 and the reported errors on partitions 2 and 3
      db.get(helloKey, (err, doc) => {
        hellodoc = doc;
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloAgainKey, (err, doc) => {
        hello2doc = doc;
        cb(expect(doc.value).to.equal('Hello again'));
      });
      db.get(heyKey, (err, doc) => {
        heydoc = doc;
        cb(expect(doc.value).to.equal('Hey'));
      });
      db.get(blahKey, (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(awwwwKey, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Remove the docs from the db
    const remove = (done) => {
      debug('several partitions: starting remove ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('several partitions: remove finished');
          done();
        }
      };

      // Expect no errors on partitions 0 and 1 and the reported errors
      // on partitions 2 and 3
      db.remove(hellodoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(hello2doc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(heydoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove({
        id: blahKey
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.remove({
        id: awwwwKey
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Attempt to get the docs back from the db again
    const getagain = (done) => {
      debug('several partitions: starting getagain ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('several partitions: getagain finished');
          done();
        }
      };

      // Expect the docs to not be found, and the reported errors on
      // partitions 2 and 3
      db.get(helloKey, (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(helloAgainKey, (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(heyKey, (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(blahKey, (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(awwwwKey, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Run all the above steps
    clean(() => put(() => putAgain(() => get(() => remove(() =>
      getagain(done))))));
  });

});
