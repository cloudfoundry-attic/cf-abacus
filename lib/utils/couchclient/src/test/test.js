'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

const _ = require('underscore');
const sample = _.sample;
const flatten = _.flatten;
const map = _.map;
const range = _.range;

const memdown = require('memdown');
const PouchDB = require('pouchdb');
const partition = require('abacus-partition');
const batch = require('abacus-batch');
const couchclient = require('..');

/* eslint handle-callback-err: 0 */

const dbserver = () => process.env.DB;
const debug = require('abacus-debug')('abacus-couchclient-test');

describe('abacus-couchclient', (d) => {
  const helloKey = couchclient.kturi('Hello', Date.parse(
    'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'));
  const helloAgainKey = couchclient.kturi('Hello', Date.parse(
    'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)'));
  const heyKey = couchclient.tkuri('Hey', Date.parse(
    'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'));
  const blahKey = couchclient.kturi('Blah', Date.parse(
    'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'));
  const awwwwKey = couchclient.kturi('Awwww', Date.parse(
    'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'));

  before(function(done) {
    if (process.env.DBCLIENT && process.env.DBCLIENT !== 'abacus-couchclient') {
      console.log('  Skipping couchclient tests. DBCLIENT set to',
        process.env.DBCLIENT);
      this.skip();
      done();
    }

    // Delete test dbs on the configured db server
    couchclient.drop(dbserver(), /^abacus-couchclient-/, done);
  });

  it('distributes db operations over several db partitions', (done) => {

    // Setup a partitioned db
    // Use a custom partition function causing some errors to help test
    // error handling. That complicates the setup a bit.
    //
    // Without that error test code, a normal setup would look like this:
    // const db = couchclient(partition, function(p) { return ['testdb',
    // p.join('-')].join('-'); }, function(uri, opt, cb) {
    //   cb(undefined, new PouchDB(uri, { db: memdown }));
    // });
    //
    const berr = new Error('Can\'t load balance DB partition 3');
    const perr = new Error('Can\'t open DB partition 2-201411');
    const db = couchclient(partition.partitioner(
      partition.bucket, partition.period, partition.forward, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }), couchclient.dburi(dbserver(), 'abacus-couchclient-test'),
        (uri, opt, cb) => {
          // Cause DB handler errors on DB partition 2-201411
          return /couchclient-test-2-201411/.test(uri) ? cb(perr) :
            couchclient.dbcons(uri, opt, cb);
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

  it('distributes batches of ops over several db partitions', (done) => {

    // Setup a partitioned db
    // Use a custom partition function causing some errors to help test
    // error handling. That complicates the setup a bit.
    //
    // Without that error test code, a normal setup would look like this:
    // const db = couchclient(partition, function(p) { return ['testdb',
    // p.join('-')].join('-'); }, function(uri, opt, cb) {
    //   cb(undefined, new PouchDB(uri, { db: memdown }));
    // });
    //
    const berr = new Error('Can\'t load balance DB partition 3');
    const perr = new Error('Can\'t open DB partition 2-201411');
    const db = batch(couchclient(partition.partitioner(
      partition.bucket, partition.period, partition.forward, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }), couchclient.dburi(dbserver(), 'abacus-couchclient-test'),
        (uri, opt, cb) => {
          // Cause DB handler errors on DB partition 2-201411
          return /couchclient-test-2-201411/.test(uri) ? cb(perr) :
            couchclient.dbcons(uri, opt, cb);
        }));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      debug('batch: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('batch: clean finished');
          done();
        }
      };

      db.get(helloKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Put some docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const put = (done) => {
      debug('batch: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('batch: put finished');
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
      debug('batch: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('batch: put finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.not.equal(null)));
      db.put({
        id: helloAgainKey,
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
      debug('batch: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('batch: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1 and the reported errors on partitions 2 and 3
      db.get(helloKey, (err, doc) => {
        hellodoc = doc;
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloAgainKey, (err, doc) => {
        hello2doc = doc;
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello again'));
      });
      db.get(heyKey, (err, doc) => {
        heydoc = doc;
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hey'));
      });
      db.get(blahKey, (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(awwwwKey, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Get the same document several times in a batch
    const getDuplicate = (done) => {
      debug('batch: starting getDuplicate ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 6) {
          debug('batch: getDuplicate finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db
      db.get(helloKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloAgainKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello again'));
      });
      db.get(helloKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloAgainKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello again'));
      });
    };

    // Remove the docs from the db
    const remove = (done) => {
      debug('batch: starting remove ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('batch: remove finished');
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
      debug('batch: starting getagain ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('batch: gatagain finished');
          done();
        }
      };

      // Expect notfound errors and reported errors on partitions 2 and 3
      db.get(helloKey, (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(helloAgainKey, (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(heyKey, (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(blahKey, (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(awwwwKey, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Run all the above steps
    clean(() => put(() => putAgain(() => get(() => getDuplicate(() =>
      remove(() => getagain(done)))))));
  });

  it('distributes bulk operations over 4 db partitions', (done) => {

    // Setup a partitioned db
    // Use a custom partition function causing some errors to help test
    // error handling. That complicates the setup a bit.
    //
    // Without that error test code, a normal setup would look like this:
    // const db = couchclient(partition, function(p) { return ['testdb',
    // p.join('-')].join('-'); }, function(uri, opt, cb) {
    //   cb(undefined, new PouchDB(uri, { db: memdown }));
    // });
    //
    const berr = new Error('Can\'t load balance DB partition 3');
    const perr = new Error('Can\'t open DB partition 2-201411');
    const db = couchclient(partition.partitioner(
      partition.bucket, partition.period, partition.forward, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }), (p) => {
      return ['abacus-couchclient-testbulk', p.join('-')].join('-');
    }, (uri, opt, cb) => {
      // Cause DB handler errors on DB partition 2-201411
      return /couchclient-testbulk-2-201411/.test(uri) ? cb(perr) :
        dbserver() ?
          cb(undefined, new PouchDB([dbserver(), uri].join('/'))) :
          cb(undefined, new PouchDB(uri, {
            db: memdown
          }));
    });

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      debug('bulk: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('bulk: clean finished');
          done();
        }
      };

      db.get(helloKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (done) => {
      debug('bulk: starting putlist ...');
      db.bulkDocs([{
        id: helloKey,
        value: 'Hello'
      },
        {
          id: helloAgainKey,
          value: 'Hello again'
        },
        {
          id: heyKey,
          value: 'Hey'
        }], {}, (err, doc) => {
          expect(err).to.equal(null);
          debug('bulk: putlist finished');
          done();
        });
    };

    // Verify conflict on second bulkDocs invocation
    const verifyPutlist = (done) => {
      debug('bulk: starting verifyPutlist ...');
      db.bulkDocs([
        {
          id: helloKey,
          value: 'Hello'
        },
        {
          id: helloAgainKey,
          value: 'Hello again'
        },
        {
          id: heyKey,
          value: 'Hey'
        }
      ], {}, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs).not.to.equal(undefined);
        expect(docs.length).to.equal(3);
        for(const doc of docs) {
          expect(doc).not.to.equal(undefined);
          expect(doc.error).to.not.equal(undefined);
          expect(doc.status).to.equal(409);
          expect(doc.noretry).to.equal(true);
          expect(doc.nobreaker).to.equal(true);
        }
        debug('bulk: verifyPutlist finished');
        done();
      });
    };

    // Put a list of docs into the partitioned db, use partitions
    // 2 and 3 to test error handling
    const puterr = (done) => {
      debug('bulk: starting puterr ...');
      db.bulkDocs([{
        id: blahKey,
        value: 'Blah'
      },
        {
          id: awwwwKey,
          value: 'Awwww'
        }], {}, (err, docs) => {
          expect(err).to.equal(berr);
          debug('bulk: puterr finished');
          done();
        });
    };

    // Get the docs back from the db
    const get = (done) => {
      debug('bulk: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('bulk: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1
      db.get(helloKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(helloAgainKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hello again'));
      });
      db.get(heyKey, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.value).to.equal('Hey'));
      });
    };

    // Get a list of docs back from the db
    const getlist = (done) => {
      debug('bulk: starting getlist ...');
      // Expect to get the requested docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        keys: [
          helloKey,
          helloAgainKey,
          heyKey
        ]
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(3);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[1].doc.value).to.equal('Hello again');
        expect(docs.rows[2].doc.value).to.equal('Hey');

        debug('bulk: getlist finished');
        done();
      });
    };

    // Get a list of docs from the partitioned db, use partitions
    // 2 and 3 to test error handling
    const geterr = (done) => {
      debug('bulk: starting geterr ...');
      db.allDocs({
        include_docs: true,
        keys: [
          blahKey,
          awwwwKey
        ]
      }, (err, doc) => {
        expect(err).to.equal(berr);

        debug('bulk: geterr finished');
        done();
      });
    };

    // Get a range of docs back from the db
    const getrange = (done) => {
      debug('bulk: starting getrange ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[1].doc.value).to.equal('Hello again');

        debug('bulk: getrange finished');
        done();
      });
    };

    // Get a range of docs metadata back from the db without the values
    const getNoDocs = (done) => {
      debug('bulk: starting getNoDocs ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: false,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc).to.equal(undefined);
        expect(docs.rows[1].doc).to.equal(undefined);

        debug('bulk: getNoDocs finished');
        done();
      });
    };

    // Get a range of docs back from the db in descending order
    const getDocsAscending = (done) => {
      debug('bulk: starting getDocsAscending ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: helloKey,
        endkey: helloAgainKey,
        descending: false
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[1].doc.value).to.equal('Hello again');

        debug('bulk: getDocsAscending finished');
        done();
      });
    };

    // Get a range of docs back from the db in descending order
    const getDocsDescending = (done) => {
      debug('bulk: starting getDocsDescending ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: helloAgainKey,
        endkey: helloKey,
        descending: true
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal('Hello again');
        expect(docs.rows[1].doc.value).to.equal('Hello');

        debug('bulk: getDocsDescending finished');
        done();
      });
    };

    // Get a limited range of docs back from the db
    const getlimit = (done) => {
      debug('bulk: starting getlimit ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        limit: 1,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(1);
        expect(docs.rows[0].doc.value).to.equal('Hello');

        debug('bulk: getlimit finished');
        done();
      });
    };

    // Get a range of docs from the partitioned db, use partitions
    // 2 and 3 to test error handling
    const getrangeerr = (done) => {
      debug('bulk: starting getrangeerr ...');
      db.allDocs({
        include_docs: true,
        startkey: couchclient.kturi('Blah', Date.parse(
          'Sun Oct 05 2014 19:06:54 GMT-0800 (PST)')),
        endkey: couchclient.kturi('Blah', Date.parse(
          'Sun Dec 07 2014 19:07:54 GMT-0800 (PST)'))
      }, (err, docs) => {
        expect(err).to.equal(berr);

        debug('bulk: getrangeerr finished');
        done();
      });
    };

    // Run the above steps
    clean(() => putlist(() => verifyPutlist(() => puterr(() => get(() =>
      getlist(() => geterr(() => getrange(() => getNoDocs(() =>
        getDocsAscending(() => getDocsDescending(() => getlimit(() =>
          getrangeerr(done)))))))))))));
  });

  it('can construct a default partitioned db handle', (done) => {
    // Try to read docs to test db connection
    const read = (db, done) => {
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.not.equal(undefined);
        expect(doc).to.equal(undefined);
        if(++cbs === 3) done();
      };

      db.get(helloKey, (err, doc) => cb(err, doc));
      db.get(helloAgainKey, (err, doc) => cb(err, doc));
      db.get(heyKey, (err, doc) => cb(err, doc));
    };

    const noParams = (done) => {
      const db = couchclient();
      expect(db).to.not.equal(undefined);
      read(db, done);
    };

    noParams(done);
  });

  it('does not retry on missing documents', (done) => {
    const db = couchclient(undefined,
      couchclient.dburi(dbserver(), 'abacus-couchclient-test-missing-docs'));
    const batchDB = batch(couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-missing-docs-batch')));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      debug('missing docs: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('missing docs: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Verify that no error is generated
    const verifyGet = (db, done) => {
      debug('missing docs: starting verifyGet ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(doc).to.equal(undefined);
        expect(err).to.equal(null);
        if (++cbs === 3) {
          debug('missing docs: verifyGet finished');
          done();
        }
      };

      db.get(couchclient.kturi('Hello', 0), (err, doc) => cb(err, doc));
      db.get(couchclient.kturi('Hello', 1), (err, doc) => cb(err, doc));
      db.get(couchclient.tkuri('Hey', 0), (err, doc) => cb(err, doc));
    };

    clean(() => verifyGet(db, () => verifyGet(batchDB, done)));
  });

  it('does not retry on conflicting documents', (done) => {
    const db = couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-conflicting-docs'));
    const batchDB = batch(couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-conflicting-docs-batch')));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('conflicting docs: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('conflicting docs: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Ensure DB contains documents
    const put = (db, done) => {
      debug('conflicting docs: starting put ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(doc).to.not.equal(undefined);
        expect(err).to.equal(null);
        if (++cbs === 3) {
          debug('conflicting docs: put finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello'
      }, (err, doc) => cb(err, doc));
      db.put({
        id: helloAgainKey,
        value: 'Hello again'
      }, (err, doc) => cb(err, doc));
      db.put({
        id: heyKey,
        value: 'Hey'
      }, (err, doc) => cb(err, doc));
    };

    // Verify that generated errors are set with correct flags
    const verifyPut = (db, done) => {
      debug('conflicting docs: starting verifyPut ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(doc).to.equal(undefined);
        expect(err).to.not.equal(undefined);
        expect(err.status).to.equal(409);
        expect(err.noretry).to.equal(true);
        expect(err.nobreaker).to.equal(true);
        if (++cbs === 3) {
          debug('conflicting docs: verifyPut finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello'
      }, (err, doc) => cb(err, doc));
      db.put({
        id: helloAgainKey,
        value: 'Hello again'
      }, (err, doc) => cb(err, doc));
      db.put({
        id: heyKey,
        value: 'Hey'
      }, (err, doc) => cb(err, doc));
    };

    const inputDocs = [
      {
        id: helloKey,
        value: 'Hello'
      },
      {
        id: helloAgainKey,
        value: 'Hello again'
      },
      {
        id: heyKey,
        value: 'Hey'
      }
    ];

    // Ensure DB contains documents
    const bulkDocs = (db, done) => {
      debug('conflicting docs: starting bulkDocs ...');
      db.bulkDocs(inputDocs, {}, (err, docs) => {
        expect(docs).to.not.equal(undefined);
        expect(err).to.equal(null);

        debug('conflicting docs: bulkDocs finished');
        done();
      });
    };

    // Verify that generated errors are set with correct flags
    const verifyBulkDocs = (db, done) => {
      debug('conflicting docs: starting verifyBulkDocs ...');
      db.bulkDocs(inputDocs, {}, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs).not.to.equal(undefined);
        expect(docs.length).to.equal(3);
        for(const doc of docs) {
          expect(doc).not.to.equal(undefined);
          expect(doc.error).to.not.equal(undefined);
          expect(doc.status).to.equal(409);
          expect(doc.noretry).to.equal(true);
          expect(doc.nobreaker).to.equal(true);
        }

        debug('conflicting docs: verifyBulkDocs finished');
        done();
      });
    };

    clean(db, () => put(db, () => verifyPut(db, () => clean(db, () =>
      bulkDocs(db, () => verifyBulkDocs(db, () => clean(batchDB, () =>
        put(batchDB, () => verifyPut(batchDB, () => clean(batchDB, () =>
          bulkDocs(batchDB, () => verifyBulkDocs(batchDB, done))))))))))));
  });

  it('calls back with the documents', (done) => {
    const document = {
      'metered_usage_id': 't/0001446256800000-0-0-0-0/k/' +
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/' +
      '0b39fa70-a65f-4183-bae8-385633ca5c87/' +
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/basic',
      'accumulated_usage': [
        {
          'metric': 'memory',
          'windows': [
            [ null ],
            [ null ],
            [ null ],
            [
              {
                'quantity': {
                  'current': {
                    'consumed': 0,
                    'consuming': 2,
                    'since': 1446336000000
                  }
                },
                'cost': {
                  'burned': 0,
                  'burning': 0.00028,
                  'since': 1446336000000
                }
              },
              {
                'quantity': {
                  'current': {
                    'consumed': 0,
                    'consuming': 2,
                    'since': 1446249600000
                  }
                },
                'cost': {
                  'burned': 0,
                  'burning': 0.00028,
                  'since': 1446249600000
                }
              },
              null
            ],
            [
              {
                'quantity': {
                  'current': {
                    'consumed': 0,
                    'consuming': 2,
                    'since': 1446336000000
                  }
                },
                'cost': {
                  'burned': 0,
                  'burning': 0.00028,
                  'since': 1446336000000
                }
              },
              {
                'quantity': {
                  'current': {
                    'consumed': 0,
                    'consuming': 2,
                    'since': 1446249600000
                  }
                },
                'cost': {
                  'burned': 0,
                  'burning': 0.00028,
                  'since': 1446249600000
                }
              }
            ]
          ]
        }
      ],
      'normalized_usage_id': '351',
      'start': 1446249600000,
      'end': 1446336000000,
      'collected_usage_id': '555',
      'metered_usage_id': '443',
      'resource_id': 'test-resource',
      'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
      'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'space_id': 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      'consumer_id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      'plan_id': 'basic',
      'processed': 1446418800000,
      'processed_id': '0001446418800000-0-0-0-0',
      '_id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/' +
      '0b39fa70-a65f-4183-bae8-385633ca5c87/' +
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/' +
      'basic/t/0001446336000000/0001446336000000',
      '_rev': '1-817cb8dafb9c04d1fb26d3c6f75f5b84'
    };

    const db = couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-correct-docs'));
    const batchDB = batch(couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-correct-docs-batch')));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('correct docs: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('correct docs: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Ensure DB contains documents
    const put = (db, done) => {
      debug('correct docs: starting put ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.not.equal(undefined);
        if (++cbs === 3) {
          debug('correct docs: put finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello',
        doc: document
      }, (err, doc) => cb(err, doc));
      db.put({
        id: helloAgainKey,
        value: 'Hello again',
        doc: document
      }, (err, doc) => cb(err, doc));
      db.put({
        id: heyKey,
        value: 'Hey',
        doc: document
      }, (err, doc) => cb(err, doc));
    };

    // Verify document content
    let hellodoc;
    let hello2doc;
    let heydoc;
    const get = (db, done) => {
      debug('correct docs: starting get ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc._id).to.not.equal(undefined);
        if (++cbs === 3) {
          debug('correct docs: get finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => {
        hellodoc = doc;
        cb(err, doc);
      });
      db.get(helloAgainKey, (err, doc) => {
        hello2doc = doc;
        cb(err, doc);
      });
      db.get(heyKey, (err, doc) => {
        heydoc = doc;
        cb(err, doc);
      });
    };

    // Verify remove
    const remove = (db, done) => {
      debug('correct docs: starting remove ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('correct docs: remove finished');
          done();
        }
      };

      db.remove(hellodoc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(hellodoc._id));
      });
      db.remove(hello2doc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(hello2doc._id));
      });
      db.remove(heydoc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(heydoc._id));
      });
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (db, done) => {
      debug('correct docs: starting putlist ...');
      db.bulkDocs([
        {
          id: helloKey,
          value: 'Hello',
          doc: document
        },
        {
          id: helloAgainKey,
          value: 'Hello again',
          doc: document
        },
        {
          id: heyKey,
          value: 'Hey',
          doc: document
        }], {}, (err, docs) => {
          expect(err).to.equal(null);
          expect(docs[0].id).to.equal(helloKey);
          expect(docs[1].id).to.equal(helloAgainKey);
          expect(docs[2].id).to.equal(heyKey);

          debug('correct docs: putlist finished');
          done();
        });
    };

    // Get a range of docs back from the db
    const getrange = (db, done) => {
      debug('correct docs: starting getrange ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[1].doc.value).to.equal('Hello again');

        debug('correct docs: getrange finished');
        done();
      });
    };

    clean(db, () => put(db, () => get(db, () => remove(db, () =>
      put(batchDB, () => get(batchDB, () => remove(batchDB, () =>
        putlist(db, () => getrange(db, done)))))))));
  });

  it('does not overwrite document _id', (done) => {
    const unbatchedDb = couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-document-ids'));
    const batchedDb = batch(unbatchedDb);

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('document ids: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('document ids: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    let hellodoc;
    let hello2doc;
    let heydoc;

    // Get the docs back from the db
    const get = (db, done) => {
      debug('document ids: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('document ids: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db
      db.get(helloKey, (err, doc) => {
        expect(doc.value).to.equal('Hello');
        cb(expect(doc._id).to.equal(hellodoc._id));
      });
      db.get(helloAgainKey, (err, doc) => {
        expect(doc.value).to.equal('Hello again');
        cb(expect(doc._id).to.equal(hello2doc._id));
      });
      db.get(heyKey, (err, doc) => {
        expect(doc.value).to.equal('Hey');
        cb(expect(doc._id).to.equal(heydoc._id));
      });
    };

    // Remove and check the documents
    const remove = (db, done) => {
      debug('document ids: starting remove ...');
      let cbs = 0;
      const cb = () => {
        if (++cbs === 3) {
          debug('document ids: remove finished');
          done();
        }
      };

      db.remove(hellodoc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(hellodoc._id));
      });
      db.remove(hello2doc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(hello2doc._id));
      });
      db.remove(heydoc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(heydoc._id));
      });
    };

    // Put docs with different id and _id
    const put = (db, done) => {
      debug('document ids: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('document ids: put finished');
          done();
        }
      };

      db.put({
        _id: helloKey,
        id: helloAgainKey,
        value: 'Hello'
      }, (err, doc) => {
        cb(expect(err).to.equal(null));
        hellodoc = { _id: doc.id, _rev: doc.rev };
      });
      db.put({
        _id: helloAgainKey,
        id: heyKey,
        value: 'Hello again'
      }, (err, doc) => {
        cb(expect(err).to.equal(null));
        hello2doc = { _id: doc.id, _rev: doc.rev };
      });
      db.put({
        _id: heyKey,
        id: helloKey,
        value: 'Hey'
      }, (err, doc) => {
        cb(expect(err).to.equal(null));
        heydoc = { _id: doc.id, _rev: doc.rev };
      });
    };

    // Put a list of docs with different id and _id
    const putlist = (db, done) => {
      debug('document ids: starting putlist ...');
      db.bulkDocs([{
        _id: helloKey,
        id: helloAgainKey,
        value: 'Hello',
        doc: { key: 'value' }
      },
        {
          _id: helloAgainKey,
          id: heyKey,
          value: 'Hello again',
          doc: { key: 'value' }
        },
        {
          _id: heyKey,
          id: helloKey,
          value: 'Hey',
          doc: { key: 'value' }
        }], {}, (err, docs) => {
          expect(err).to.equal(null);

          hellodoc = { _id: docs[0].id, _rev: docs[0].rev };
          hello2doc = { _id: docs[1].id, _rev: docs[1].rev };
          heydoc = { _id: docs[2].id, _rev: docs[2].rev };

          debug('document ids: putlist finished');
          done();
        });
    };

    // Run the above steps
    clean(unbatchedDb, () => put(unbatchedDb, () => get(unbatchedDb, () =>
      remove(unbatchedDb, () => putlist(unbatchedDb, () => get(unbatchedDb,
        () => remove(batchedDb, () => put(batchedDb, () => get(batchedDb, () =>
          remove(batchedDb, () => putlist(batchedDb, () => get(batchedDb, () =>
            remove(batchedDb, done)))))))))))));
  });

  it('gets documents in the exact order', (done) => {
    const db = batch(couchclient(undefined,
      couchclient.dburi(dbserver(),
        'abacus-couchclient-test-document-order')));

    const time = 1455005971858;
    const numberOfObjects = 200;
    const getKey = (counter) => {
      return couchclient.kturi('document' + counter, time + counter);
    };

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('document order: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfObjects) {
          debug('document order: clean finished');
          done();
        }
      };

      _(numberOfObjects).times((counter) => {
        db.get(getKey(counter),
          (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      });
    };

    // Get the docs back from the db
    const get = (db, done) => {
      debug('document order: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfObjects) {
          debug('document order: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db
      _(numberOfObjects).times((counter) => {
        const key = getKey(counter);
        db.get(key, (err, doc) => {
          expect(doc.value).to.equal('content' + counter);
          cb(expect(doc._id).to.equal(key));
        });
      });
    };

    // Put docs with different id and _id
    const put = (db, done) => {
      debug('document order: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfObjects) {
          debug('document order: put finished');
          done();
        }
      };

      _(numberOfObjects).times((counter) => {
        const key = getKey(counter);
        db.put({
          _id: key,
          value: 'content' + counter
        }, (err, doc) => {
          expect(err).to.equal(null);
          cb(expect(doc.id).to.equal(key));
        });
      });
    };

    // Run the above steps
    clean(db, () => put(db, () => get(db, done)));
  });

  it('range test', (done) => {

    const part = partition.partitioner(partition.bucket, partition.period,
      partition.forward, partition.balance, true);
    const db = batch(couchclient(part,
      couchclient.dburi(dbserver(), 'abacus-couchclient-range-test')));

    const keys = ['a', 'b', 'c', 'd'];
    const docs = flatten(map(keys, (k) =>
      map(range(1417144014000, 1417576014000, 86400000), (t) =>
        couchclient.tkuri(k, couchclient.pad16(t))
      )));
    debug('range test: using keys %o', docs);

    const numberOfObjects = docs.length;
    const getKey = (counter) => {
      return docs[counter];
    };

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('range test: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfObjects) {
          debug('range test: clean finished');
          done();
        }
      };

      _(numberOfObjects).times((counter) => {
        db.get(getKey(counter),
          (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      });
    };

    // Get the docs back from the db
    const get = (db, done) => {
      debug('range test: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('range test: get finished');
          done();
        }
      };

      db.allDocs({
        startkey: 't/0001417230414000/k/c',
        endkey: 't/0001417316814000/k/z'
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(map(docs.rows, (r) => r.id)).to.deep.equal([
          't/0001417230414000/k/c',
          't/0001417230414000/k/d',
          't/0001417316814000/k/a',
          't/0001417316814000/k/b',
          't/0001417316814000/k/c',
          't/0001417316814000/k/d'
        ]);
        cb();
      });

      db.allDocs({
        startkey: 't/0001417489614000',
        endkey: 't/0001417403214000',
        descending: true
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(map(docs.rows, (r) => r.id)).to.deep.equal([
          't/0001417403214000/k/d',
          't/0001417403214000/k/c',
          't/0001417403214000/k/b',
          't/0001417403214000/k/a'
        ]);
        cb();
      });

      db.allDocs({
        startkey: 't/0001417403214000',
        endkey: 't/0001417144014000',
        descending: true,
        skip: 2,
        limit: 4
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(map(docs.rows, (r) => r.id)).to.deep.equal([
          't/0001417316814000/k/b',
          't/0001417316814000/k/a',
          't/0001417230414000/k/d',
          't/0001417230414000/k/c'
        ]);
        cb();
      });

    };

    // Put docs with different id and _id
    const put = (db, done) => {
      debug('range test: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfObjects) {
          debug('range test: put finished');
          done();
        }
      };

      _(numberOfObjects).times((counter) => {
        const key = getKey(counter);
        db.put({
          _id: key
        }, (err, doc) => {
          expect(err).to.equal(null);
          cb(expect(doc.id).to.equal(key));
        });
      });
    };

    // Run the above steps
    clean(db, () => put(db, () => get(db, done)));
  });

});
