'use strict';

// Small utility that provides a subset of the MongoDB API over a set of DB
// partitions

const _ = require('underscore');
const sample = _.sample;
const flatten = _.flatten;
const map = _.map;
const range = _.range;
const extend = _.extend;
const contains = _.contains;

const batch = require('abacus-batch');
const dbops = require('abacus-dbcommons')();
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const mongodb = require('mongodb');

/* eslint handle-callback-err: 0 */

const dbservers = () => {
  const value = process.env.DB;
  return value && value.includes('|') ? value.split('|') : [value];
};

const dbserver = () => {
  return dbservers()[0];
};

const debug = require('abacus-debug')('abacus-mongoclient-test');

// Spy the MongoDB client
const mongoDB = mongodb.MongoClient;
let mongoConnectSpy = spy(mongoDB, 'connect');
const mongodbmock = extend({}, mongodb, {
  MongoClient: extend({}, mongoDB, {
    connect: (server, options, cb) => mongoConnectSpy(server, options, cb)
  })
});
require.cache[require.resolve('mongodb')].exports = mongodbmock;

const dbclient = require('..');

describe('abacus-mongoclient', () => {
  const helloKey = dbops.kturi('Hello', moment.utc(
    '2014-11-06 19:06:54').valueOf());
  const helloAgainKey = dbops.kturi('Hello', moment.utc(
    '2014-11-06 19:07:54').valueOf());
  const heyKey = dbops.tkuri('Hey', moment.utc(
    '2014-10-06 19:06:54').valueOf());
  const blahKey = dbops.kturi('Blah', moment.utc(
    '2014-10-06 19:06:54').valueOf());
  const awwwwKey = dbops.kturi('Awwww', moment.utc(
    '2014-11-06 19:06:54').valueOf());

  before(function(done) {
    if (!process.env.DBCLIENT ||
      process.env.DBCLIENT !== 'abacus-mongoclient') {
      console.log('  Skipping mongoclient tests. DBCLIENT set to',
        process.env.DBCLIENT || 'default');
      this.skip();
      done();
    }

    // Delete test dbs on the configured db server
    dbclient.drop(dbservers(), /^abacus-mongoclient-/, done);
  });

  beforeEach(() => {
    mongoConnectSpy.reset();
  });

  afterEach(() => {
    delete process.env.DB_OPTS;
  });

  const cbfn = (count, done) => {
    let cbs = 0;
    return () => {
      if(++cbs === count)
        done();
    };
  };

  const cbfnexpect = (count, expect, done) => {
    let cbs = 0;
    return (err, res) => {
      expect(err, res);
      if(++cbs === count)
        done();
    };
  };

  const cbfnspy = (count, connectCount, done) => {
    let cbs = 0;
    return () => {
      if(++cbs === count) {
        expect(mongoConnectSpy.callCount).to.equal(connectCount);
        done();
      }
    };
  };

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
      }), dbclient.dburi(dbservers(),
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

  it('distributes batches of ops over several db partitions', (done) => {

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
    const db = batch(dbclient(partition.partitioner(
      partition.bucket, partition.period, partition.forward, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }), dbclient.dburi(dbservers(),
        'abacus-mongoclient-test'), (uri, opt, cb) => {
          // Cause DB handler errors on DB partition 2-201411
          return /mongoclient-test-2-201411/.test(uri) ? cb(perr) :
            dbclient.dbcons(uri, opt, cb);
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
      debug('batch: starting put again ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('batch: put again finished');
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
      }), dbclient.dburi(dbservers(),
        'abacus-mongoclient-testbulk'), (uri, opt, cb) => {
          // Cause DB handler errors on DB partition 2-201411
          return /mongoclient-testbulk-2-201411/.test(uri) ? cb(perr) :
            dbclient.dbcons(uri, opt, cb);
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
      ], {}, (err, doc) => {
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
        expect(err).to.not.equal(null);
        expect(docs).to.equal(undefined);
        debug('bulk: verifyPutlist finished');
        done();
      });
    };


    // Put a list of docs into the partitioned db, use partitions
    // 2 and 3 to test error handling
    const puterr = (done) => {
      debug('bulk: starting puterr ...');
      db.bulkDocs([
        {
          id: blahKey,
          value: 'Blah'
        },
        {
          id: awwwwKey,
          value: 'Awwww'
        }
      ], {}, (err, docs) => {
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

        expect(docs.rows[0].doc._id).not.to.equal(undefined);
        expect(docs.rows[0].doc.value).to.equal('Hello');

        expect(docs.rows[1].doc._id).not.to.equal(undefined);
        expect(docs.rows[1].doc.value).to.equal('Hello again');

        expect(docs.rows[2].doc._id).not.to.equal(undefined);
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
        startkey: dbops.kturi('Blah', moment.utc(
          '2014-10-05 19:06:54').valueOf()),
        endkey: dbops.kturi('Blah', moment.utc(
          '2014-12-07 19:07:54').valueOf())
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
      const db = dbclient();
      expect(db).to.not.equal(undefined);
      read(db, done);
    };

    const uriOnly = (done) => {
      const db = dbclient(undefined, (p, cb) => {
        let server = dbservers();
        if(Array.isArray(server))
          server = server.length > 0 ? server[0] : undefined;
        cb(null, server || 'mongodb://localhost:27017');
      });
      expect(db).to.not.equal(undefined);
      read(db, done);
    };

    noParams(() => uriOnly(done));
  });

  it('works with different collection', (done) => {
    let fullDB;
    let emptyDB;
    let defaultDB;

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('collections: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('collections: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    const put = (db, done) => {
      debug('collections: starting put ...');
      let cbs = 0;
      const cb = () => {
        // Verify no docs exist
        if(++cbs === 3) {
          debug('collections: put finished');
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
    };

    const verifyNoDocuments = (db, done) => {
      debug('collections: starting verifyNoDocuments ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.not.equal(undefined);
        expect(doc).to.equal(undefined);
        if(++cbs === 3) {
          // Verify that the docs exist
          debug('collections: verifyNoDocuments finished ...');
          done();
        }
      };

      db.get(helloKey, (err, doc) => cb(err, doc));
      db.get(helloAgainKey, (err, doc) => cb(err, doc));
      db.get(heyKey, (err, doc) => cb(err, doc));
    };

    const verifyDocuments = (db, done) => {
      debug('collections: starting verifyDocuments ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.not.equal(undefined);
        expect(doc).to.not.equal(undefined);
        if(++cbs === 3) {
          debug('collections: verifyDocuments finished ...');
          done();
        }
      };

      db.get(helloKey, (err, doc) => cb(err, doc));
      db.get(helloAgainKey, (err, doc) => cb(err, doc));
      db.get(heyKey, (err, doc) => cb(err, doc));
    };

    const fullCollection = (cb) => {
      debug('collections: starting fullCollection ...');
      const db = dbclient(undefined,
        dbclient.dburi(dbservers(),
          'abacus-mongoclient-collections-test/full-collection'));
      expect(db).to.not.equal(undefined);
      clean(db, () => put(db, () => {
        debug('collections: fullCollection finished ...');
        cb(db);
      }));
    };

    const defaultCollection = (cb) => {
      debug('collections: starting defaultCollection ...');
      const db = dbclient(undefined, dbclient.dburi(dbservers()));
      expect(db).to.not.equal(undefined);
      clean(db, () => put(db, () => {
        debug('collections: defaultCollection finished ...');
        cb(db);
      }));
    };

    const emptyCollection = (cb) => {
      debug('collections: starting emptyCollection ...');
      const db = dbclient(undefined,
        dbclient.dburi(dbservers(),
          'abacus-mongoclient-collections-test/empty-collection'));
      expect(db).to.not.equal(undefined);
      clean(db, () => {
        debug('collections: emptyCollection finished ...');
        cb(db);
      });
    };

    const createCollections = (cb) => {
      debug('collections: starting createCollections ...');
      emptyCollection((db) => {
        emptyDB = db;
        fullCollection((db) => {
          fullDB = db;
          defaultCollection((db) => {
            defaultDB = db;
            debug('collections: createCollections finished ...');
            cb();
          });
        });
      });
    };

    createCollections(() => verifyNoDocuments(emptyDB, () =>
      verifyDocuments(fullDB, () => verifyDocuments(defaultDB, done))));
  });

  it('does not retry on missing documents', (done) => {
    const db = dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-missing-docs'));
    const batchDB = batch(dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-missing-docs-batch')));

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

      db.get(dbops.kturi('Hello', 0), (err, doc) => cb(err, doc));
      db.get(dbops.kturi('Hello', 1), (err, doc) => cb(err, doc));
      db.get(dbops.tkuri('Hey', 0), (err, doc) => cb(err, doc));
    };

    clean(() => verifyGet(db, () => verifyGet(batchDB, done)));
  });

  it('does not retry on conflicting documents', (done) => {
    const db = dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-conflicting-docs'));
    const batchDB = batch(dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-conflicting-docs-batch')));

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
        expect(err).not.to.equal(null);
        expect(err.status).to.equal(409);
        expect(err.noretry).to.equal(true);
        expect(err.nobreaker).to.equal(true);
        expect(docs).to.equal(undefined);

        debug('conflicting docs: verifyBulkDocs finished');
        done();
      });
    };

    clean(db, () => put(db, () => verifyPut(db, () => clean(db, () =>
      bulkDocs(db, () => verifyBulkDocs(db, () => clean(batchDB, () =>
        put(batchDB, () => verifyPut(batchDB, () => clean(batchDB, () =>
          bulkDocs(batchDB, () => verifyBulkDocs(batchDB, done))))))))))));
  });

  it('calls back with the document ids and revision', (done) => {
    const document = {
      '_id': 't/0001446256800000-0-0-0-0/k/' +
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
      'processed_id': '0001446418800000-0-0-0-0'
    };

    const db = dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-correct-docs'));
    const batchDB = batch(dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-correct-docs-batch')));

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
        expect(doc.rev).to.equal('1');
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
        expect(doc.id).to.not.equal(undefined);
        expect(doc._rev).to.equal('1');
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
      const cb = (err, doc, id) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.equal(id);
        expect(doc.rev).to.equal('1');
        if(++cbs === 3) {
          debug('correct docs: remove finished');
          done();
        }
      };

      db.remove(hellodoc, (err, doc) => {
        cb(err, doc, hellodoc._id);
      });
      db.remove(hello2doc, (err, doc) => {
        cb(err, doc, hello2doc._id);
      });
      db.remove(heydoc, (err, doc) => {
        cb(err, doc, heydoc._id);
      });
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (db, done) => {
      debug('correct docs: starting putlist ...');
      db.bulkDocs([{
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
        expect(docs[0].rev).to.equal('1');
        expect(docs[1].id).to.equal(helloAgainKey);
        expect(docs[1].rev).to.equal('1');
        expect(docs[2].id).to.equal(heyKey);
        expect(docs[2].rev).to.equal('1');

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
        expect(docs.rows[0].value.rev).to.equal('1');
        expect(docs.rows[1].doc.value).to.equal('Hello again');
        expect(docs.rows[1].value.rev).to.equal('1');

        debug('correct docs: getrange finished');
        done();
      });
    };

    clean(db, () => put(db, () => get(db, () => remove(db, () =>
      put(batchDB, () => get(batchDB, () => remove(batchDB, () =>
        putlist(db, () => getrange(db, done)))))))));
  });

  it('stores revision fields', (done) => {
    const document = {
      'processed': 1446418800000,
      'processed_id': '0001446418800000-0-0-0-0'
    };
    const revision = '1-817cb8dafb9c04d1fb26d3c6f75f5b84';

    const db = dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-revisions-docs'));
    const batchDB = batch(dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-revisions-docs-batch')));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('revisions in docs: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('revisions in docs: clean finished');
          done();
        }
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Add docs in DB
    const put = (db, done) => {
      debug('revisions in docs: starting put ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.not.equal(undefined);
        expect(doc.rev).to.equal(revision);
        if (++cbs === 3) {
          debug('revisions in docs: put finished');
          done();
        }
      };

      db.put({
        id: helloKey,
        value: 'Hello',
        doc: document,
        _rev: revision
      }, (err, doc) => cb(err, doc));
      db.put({
        id: helloAgainKey,
        value: 'Hello again',
        doc: document,
        _rev: revision
      }, (err, doc) => cb(err, doc));
      db.put({
        id: heyKey,
        value: 'Hey',
        doc: document,
        _rev: revision
      }, (err, doc) => cb(err, doc));
    };

    // Verify document content
    let hellodoc;
    let hello2doc;
    let heydoc;
    const get = (db, done) => {
      debug('revisions in docs: starting get ...');
      let cbs = 0;
      const cb = (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.not.equal(undefined);
        expect(doc._rev).to.equal(revision);
        if (++cbs === 3) {
          debug('revisions in docs: get finished');
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
      debug('revisions in docs: starting remove ...');
      let cbs = 0;
      const cb = (err, doc, id) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.equal(id);
        expect(doc.rev).to.equal(revision);
        if(++cbs === 3) {
          debug('revisions in docs: remove finished');
          done();
        }
      };

      db.remove(hellodoc, (err, doc) => {
        cb(err, doc, hellodoc._id);
      });
      db.remove(hello2doc, (err, doc) => {
        cb(err, doc, hello2doc._id);
      });
      db.remove(heydoc, (err, doc) => {
        cb(err, doc, heydoc._id);
      });
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (db, done) => {
      debug('revisions in docs: starting putlist ...');
      db.bulkDocs([
        {
          id: helloKey,
          value: 'Hello',
          doc: document,
          _rev: revision
        },
        {
          id: helloAgainKey,
          value: 'Hello again',
          doc: document,
          _rev: revision
        },
        {
          id: heyKey,
          value: 'Hey',
          doc: document,
          _rev: revision
        }], {}, (err, docs) => {
          expect(err).to.equal(null);
          expect(docs[0].id).to.equal(helloKey);
          expect(docs[0].rev).to.equal(revision);
          expect(docs[1].id).to.equal(helloAgainKey);
          expect(docs[1].rev).to.equal(revision);
          expect(docs[2].id).to.equal(heyKey);
          expect(docs[2].rev).to.equal(revision);

          debug('revisions in docs: putlist finished');
          done();
        }
      );
    };

    // Get a range of docs back from the db
    const getrange = (db, done) => {
      debug('revisions in docs: starting getrange ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[0].value.rev).to.equal(revision);
        expect(docs.rows[1].doc.value).to.equal('Hello again');
        expect(docs.rows[1].value.rev).to.equal(revision);

        debug('revisions in docs: getrange finished');
        done();
      });
    };

    clean(db, () => put(db, () => get(db, () => remove(db, () =>
      put(batchDB, () => get(batchDB, () => remove(batchDB, () =>
        putlist(db, () => getrange(db, done)))))))));
  });

  it('handles documents with error field', (done) => {
    const helloDoc = {
      start: 1420243200000,
      end: 1420245000000,
      organization_id: 'invalidOrg',
      space_id: 'invalidSpace',
      consumer_id: 'invalidConsumer',
      resource_id: 'test-resource',
      plan_id: 'invalidPlan',
      resource_instance_id: 'invalidResourceInstance',
      measured_usage: [
        {
          measure: 'light_api_calls',
          quantity: 12
        }
      ],
      id: helloKey,
      processed_id: '0001461244773105-0-0-0-0',
      processed: 1461244773104,
      error: true,
      reasons: [
        'Unable to retrieve resource type for resource id test-resource',
        'Unable to retrieve account info for invalidOrg at 1420245000000'
      ],
      collected_usage_id: 't/0001461244772991-0-0-0-0/k/anonymous'
    };
    const helloAgainDoc = {
      id: helloAgainKey,
      error: true
    };

    const db = dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-docs-with-error'));
    const batchDB = batch(dbclient(undefined,
      dbclient.dburi(dbservers(),
        'abacus-mongoclient-test-docs-with-error-batch')));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('docs with error: starting clean ...');
      const cb = () => {
        debug('docs with error: clean finished');
        done();
      };

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Ensure DB contains documents
    const put = (db, done) => {
      debug('docs with error: starting put ...');
      const cb = (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.not.equal(undefined);
        debug('docs with error: put finished');
        done();
      };

      db.put(helloDoc, (err, doc) => cb(err, doc));
    };

    // Verify helloDoc content
    let hellodoc;
    const get = (db, done) => {
      debug('docs with error: starting get ...');
      const cb = (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.not.equal(undefined);
        debug('docs with error: get finished');
        done();
      };

      db.get(helloKey, (err, doc) => {
        hellodoc = doc;
        cb(err, doc);
      });
    };

    // Verify remove
    const remove = (db, done) => {
      debug('docs with error: starting remove ...');
      const cb = () => {
        debug('docs with error: remove finished');
        done();
      };

      db.remove(hellodoc, (err, doc) => {
        expect(err).to.equal(null);
        cb(expect(doc.id).to.equal(hellodoc._id));
      });
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (db, done) => {
      debug('docs with error: starting putlist ...');
      db.bulkDocs([helloDoc, helloAgainDoc], {}, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs[0].id).to.equal(helloKey);
        expect(docs[1].id).to.equal(helloAgainKey);

        debug('docs with error: putlist finished');
        done();
      });
    };

    // Get a range of docs back from the db
    const getrange = (db, done) => {
      debug('docs with error: starting getrange ...');
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(err).to.equal(null);
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.id).to.equal(helloKey);
        expect(docs.rows[1].doc.id).to.equal(helloAgainKey);

        debug('docs with error: getrange finished');
        done();
      });
    };

    clean(db, () => put(db, () => get(db, () => remove(db, () =>
      put(batchDB, () => get(batchDB, () => remove(batchDB, () =>
        putlist(db, () => getrange(db, done)))))))));
  });

  it('preserves URI options when constructing DB URIs', (done) => {
    const cb = cbfnspy(8, 0, done);

    const serverNameFunc = dbclient.dburi('mongodb://localhost:1234' +
      '?ssl=true', 'ssl-test');
    serverNameFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('mongodb://localhost:1234/ssl-test-1?ssl=true')));
    serverNameFunc(['1', '23'], (err, u) => 
      cb(expect(u).to.equal(
        'mongodb://localhost:1234/ssl-test-1-23?ssl=true')));

    const serverFunc = dbclient.dburi('mongodb://localhost:1234?ssl=true');
    serverFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('mongodb://localhost:1234/-1?ssl=true')));
    serverFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('mongodb://localhost:1234/-1-23?ssl=true')));

    const nameFunc = dbclient.dburi(undefined, 'dbname');
    nameFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('dbname-1')));
    nameFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('dbname-1-23')));

    const noSchemaFunc = dbclient.dburi('localhost:2345?ssl=true', 'dbname');
    noSchemaFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('localhost:2345/dbname-1?ssl=true')));
    noSchemaFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('localhost:2345/dbname-1-23?ssl=true')));
  });

  it('reads custom Mongo options from environment', (done) => {
    // override the poolSize internal default
    process.env.DB_OPTS = `{
      "poolSize": 2,
      "autoReconnect" : true,
      "ha" : true
    }`;

    const checkOptions = (err, db) => {
      debug('custom Mongo opts: check options started ...');
      expect(err).to.equal(null);
      expect(db).to.not.equal(undefined);
      expect(db.dbconsOptions).to.deep.equal(
        JSON.parse(process.env.DB_OPTS)
      );
      debug('custom Mongo opts: check options finished');
      done();
    };

    const db = dbclient(undefined, dbclient.dburi(dbservers(),
      'abacus-mongoclient-mongooptions-test/collection'),
      (uri, opt, cb) => dbclient.dbcons(uri, opt, checkOptions));

    debug('custom Mongo opts: db get starting ...');
    db.get(helloKey);
    debug('custom Mongo opts: db get finished');
  });

  it('generates URI without collection', (done) => {
    const rs = '127.0.0.1:1234,localhost:3456,localhost:5678';

    const cb = cbfnspy(10, 0, done);

    const serverNameFunc = dbclient.dburi('mongodb://' + rs +
      '?ssl=true', 'ssl-test');
    serverNameFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs + '/ssl-test-1?ssl=true')));
    serverNameFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs + '/ssl-test-1-23?ssl=true')));

    const serverFunc = dbclient.dburi('mongodb://' + rs + '?ssl=true');
    serverFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs + '/-1?ssl=true')));
    serverFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs + '/-1-23?ssl=true')));

    const noSchemaFunc = dbclient.dburi(rs + '?ssl=true', 'dbname');
    noSchemaFunc(['1'], (err, u) =>
      cb(expect(u).to.equal(rs + '/dbname-1?ssl=true')));
    noSchemaFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal(rs + '/dbname-1-23?ssl=true')));

    const replicaSetFunc = dbclient.dburi('mongodb://' + rs +
      '?rs=foo&ssl=true', 'dbname');
    replicaSetFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs + '/dbname-1?rs=foo&ssl=true')));
    replicaSetFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs +
      '/dbname-1-23?rs=foo&ssl=true')));

    const replicaSetCollectionFunc = dbclient.dburi('mongodb://' + rs +
      '?rs=foo&ssl=true', 'dbname/collection');
    replicaSetCollectionFunc(['1'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' + rs +
      '/dbname/collection-1?rs=foo&ssl=true')));
    replicaSetCollectionFunc(['1', '23'], (err, u) =>
      cb(expect(u).to.equal('mongodb://' +
      rs + '/dbname/collection-1-23?rs=foo&ssl=true')));
  });

  it('with many servers, returns the correct server', (done) => {
    const cb = cbfnspy(4, 8, done);

    const multiServerFunc = dbclient.dburi([
      dbserver() + '/abacus-mongoclient-0',
      dbserver() + '/abacus-mongoclient-1'], 'abacus');
    multiServerFunc(['0', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-0-201703')));
    multiServerFunc(['1', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-1/abacus-1-201703')));
    multiServerFunc(['2', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-2-201703')));
    multiServerFunc(['3', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-1/abacus-3-201703')));
  });

  it('with one server, returns this server', (done) => {
    const cb = cbfnspy(2, 0, done);

    const singleServerFunc = dbclient.dburi([
      dbserver() + '/abacus-mongoclient-0'], 'abacus');
    singleServerFunc(['4', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-4-201703')));
    singleServerFunc(['5', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-5-201703')));
  });

  it('with many servers, memoizes the correct server', (done) => {
    const cb = cbfnspy(4, 2, done);

    const multiServerFunc = dbclient.dburi([
      dbserver() + '/abacus-mongoclient-0',
      dbserver() + '/abacus-mongoclient-1'], 'abacus');
    multiServerFunc(['6', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-6-201703')));
    multiServerFunc(['6', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-6-201703')));
    multiServerFunc(['6', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-6-201703')));
    multiServerFunc(['6', '201703'], (err, u) =>
      cb(expect(u).to.equal(
        dbserver() + '/abacus-mongoclient-0/abacus-6-201703')));
  });

  it('if the partition exits, returns the correct server', (done) => {
    const db = dbclient(undefined, dbclient.dburi(
      dbserver() + '/abacus-mongoclient-1', 'abacus'));

    // Put a document to create the partition
    db.put({
      id: helloKey,
      value: 'Hello'
    }, (err, doc) => {
      expect(err).to.equal(null);

      const multiServerFunc = dbclient.dburi([
        dbserver() + '/abacus-mongoclient-0',
        dbserver() + '/abacus-mongoclient-1'], 'abacus');
      multiServerFunc(['0', '201411'], (err, u) => {
        expect(u).to.equal(
          dbserver() + '/abacus-mongoclient-1/abacus-0-201411');
        expect(mongoConnectSpy.callCount).to.equal(3);
        done();
      });
    });
  });

  it('on connection error, propagates the error', (done) => {
    const original = mongoConnectSpy;
    mongoConnectSpy = spy((server, options, cb) => {
      cb('connection error');
    });
    const multiServerFunc = dbclient.dburi([
      dbserver() + '/abacus-mongoclient-0',
      dbserver() + '/abacus-mongoclient-1'], 'abacus');
    multiServerFunc(['7', '201703'], (err, u) => {
      expect(err).to.equal('connection error');
      mongoConnectSpy = original;
      done();
    });
  });

  it('removes collection from URL', () => {
    // simplest case
    expect(dbclient.removeCollectionFromUrl(
      'mongodb://10.11.25.240:27017/db')
    ).to.equal(
      'mongodb://10.11.25.240:27017/db'
    );

    // user and password are kept
    expect(dbclient.removeCollectionFromUrl(
      'mongodb://user:password@' +
      '10.11.25.240:27017' +
      '/db')
    ).to.equal(
      'mongodb://user:password@' +
      '10.11.25.240:27017' +
      '/db'
    );

    // removes collection
    expect(dbclient.removeCollectionFromUrl(
      'mongodb://user:password@' +
      '10.11.25.240:27017' +
      '/db' +
      '/abacus-aggregator-aggregated-usage-4-201609')
    ).to.equal(
      'mongodb://user:password@' +
      '10.11.25.240:27017' +
      '/db'
    );

    // keeps request parameters
    expect(dbclient.removeCollectionFromUrl(
      'mongodb://10.11.25.240:27017' +
      '/db' +
      '/abacus-aggregator-aggregated-usage-4-201609' +
      '?ssl=true')
    ).to.equal(
      'mongodb://10.11.25.240:27017' +
      '/db' +
      '?ssl=true'
    );

    // with credentials and request parameters it removes collection
    expect(dbclient.removeCollectionFromUrl(
      'mongodb://user:password@' +
      '10.11.25.240:27017' +
      '/db' +
      '/abacus-aggregator-aggregated-usage-4-201609' +
      '?ssl=true')
    ).to.equal(
      'mongodb://user:password@' +
      '10.11.25.240:27017' +
      '/db' +
      '?ssl=true'
    );

    // supports multiple hosts of replica set
    expect(dbclient.removeCollectionFromUrl(
      'mongodb://user:password@' +
      '10.11.25.240:27017,' +
      '10.11.25.241:27017,' +
      '10.11.25.242:27017' +
      '/db' +
      '/abacus-aggregator-aggregated-usage-4-201609' +
      '?ssl=true&replicaSet=replSetId')
    ).to.equal(
      'mongodb://user:password@' +
      '10.11.25.240:27017,' +
      '10.11.25.241:27017,' +
      '10.11.25.242:27017' +
      '/db' +
      '?ssl=true&replicaSet=replSetId'
    );
  });

  it('gets proper collection name', () => {
    const collectionName = 'abacus-aggregator-aggregated-usage-4-201609';
    const defaultCollectionName = 'documents';

    // error DB
    expect(dbclient.getCollectionName({
      errorDB: () => {}
    })).to.equal(defaultCollectionName);

    // simplest case
    expect(dbclient.getCollectionName({
      name: 'mongodb://10.11.25.240:27017/db'
    })).to.equal(defaultCollectionName);

    // credentials and no collection
    expect(dbclient.getCollectionName({
      name: 'mongodb://user:password@10.11.25.240:27017/db'
    })).to.equal(defaultCollectionName);

    // request parameters and no collection
    expect(dbclient.getCollectionName({
      name: 'mongodb://user:password@10.11.25.240:27017/db?ssl=true'
    })).to.equal(defaultCollectionName);

    // credentials and collection
    expect(dbclient.getCollectionName({
      name: 'mongodb://user:password@10.11.25.240:27017/' +
      'db/' + collectionName
    })).to.equal(collectionName);

    // request parameters and collection
    expect(dbclient.getCollectionName({
      name: 'mongodb://user:password@10.11.25.240:27017/' +
      'db/' + collectionName + '?ssl=true'
    })).to.equal(collectionName);

    // replica set
    expect(dbclient.getCollectionName({
      name: 'mongodb://user:password@' +
      '10.11.25.240:27017,' +
      '10.11.25.241:27017,' +
      '10.11.25.242:27017' +
      '/db/' + collectionName
    })).to.equal(collectionName);

    // replica set and request parameters
    expect(dbclient.getCollectionName({
      name: 'mongodb://user:password@' +
      '10.11.25.240:27017,' +
      '10.11.25.241:27017,' +
      '10.11.25.242:27017' +
      '/db/' + collectionName +
      '?ssl=true&replicaSet=replSetId'
    })).to.equal(collectionName);
  });

  it('does not overwrite document _id', (done) => {
    const unbatchedDb = dbclient(undefined,
      dbclient.dburi(dbservers(), 'abacus-mongoclient-test-document-ids'));
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
        hellodoc = { _id: doc.id };
      });
      db.put({
        _id: helloAgainKey,
        id: heyKey,
        value: 'Hello again'
      }, (err, doc) => {
        cb(expect(err).to.equal(null));
        hello2doc = { _id: doc.id };
      });
      db.put({
        _id: heyKey,
        id: helloKey,
        value: 'Hey'
      }, (err, doc) => {
        cb(expect(err).to.equal(null));
        heydoc = { _id: doc.id };
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

        hellodoc = { _id: docs[0].id };
        hello2doc = { _id: docs[1].id };
        heydoc = { _id: docs[2].id };

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

  it('gets documents in the exact order', function(done) {
    const db = batch(dbclient(undefined,
      dbclient.dburi(dbservers(), 'abacus-mongoclient-test-document-order')));

    const time = 1455005971858;
    const numberOfDocuments = 1000;
    const getKey = (counter) => {
      return dbops.kturi('document' + counter, time + counter);
    };

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (db, done) => {
      debug('document order: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfDocuments) {
          debug('document order: clean finished');
          done();
        }
      };

      _(numberOfDocuments).times((counter) => {
        db.get(getKey(counter),
          (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      });
    };

    // Get the docs back from the db
    const get = (db, done) => {
      debug('document order: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === numberOfDocuments) {
          debug('document order: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db
      _(numberOfDocuments).times((counter) => {
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
        if(++cbs === numberOfDocuments) {
          debug('document order: put finished');
          done();
        }
      };

      _(numberOfDocuments).times((counter) => {
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

  it('bulk and batch ops distribute over partitions in collections', (done) => {
    const berr = new Error('Can\'t load balance DB partition 3');
    const perr = new Error('Can\'t open DB partition 2-201411');
    const db = batch(dbclient(partition.partitioner(
      partition.bucket, partition.period, partition.forward, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }), dbclient.dburi(dbservers(),
        'abacus-mongoclient-partitions-test/collection'),
        (uri, opt, cb) => {
          // Cause DB handler errors on DB partition 2-201411
          return /collection-2-201411/.test(uri) ? cb(perr) :
            dbclient.dbcons(uri, opt, cb);
        }));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      debug('collection partitions: starting clean ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) {
          debug('collection partitions: clean finished');
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
      debug('collection partitions: starting put ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('collection partitions: put finished');
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

    // Get the docs back from the db
    const get = (done) => {
      debug('collection partitions: starting get ...');
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) {
          debug('collection partitions: get finished');
          done();
        }
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1 and the reported errors on partitions 2 and 3
      db.get(helloKey, (err, doc) =>
        cb(expect(doc.value).to.equal('Hello')));
      db.get(helloAgainKey, (err, doc) =>
        cb(expect(doc.value).to.equal('Hello again'))
      );
      db.get(heyKey, (err, doc) =>
        cb(expect(doc.value).to.equal('Hey'))
      );
      db.get(blahKey, (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(awwwwKey, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (done) => {
      debug('collection partitions: starting putlist ...');
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
      ], {}, (err, doc) => {
        expect(err).to.equal(null);
        debug('collection partitions: putlist finished');
        done();
      });
    };

    // Put a list of docs into the partitioned db, use partitions
    // 2 and 3 to test error handling
    const puterr = (done) => {
      debug('collection partitions: starting puterr ...');
      db.bulkDocs([
        {
          id: blahKey,
          value: 'Blah'
        },
        {
          id: awwwwKey,
          value: 'Awwww'
        }
      ], {}, (err, docs) => {
        expect(err).to.equal(berr);
        debug('collection partitions: puterr finished');
        done();
      });
    };

    // Get a list of docs back from the db
    const getlist = (done) => {
      debug('collection partitions: starting getlist ...');
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

        expect(docs.rows[0].doc._id).not.to.equal(undefined);
        expect(docs.rows[0].doc.value).to.equal('Hello');

        expect(docs.rows[1].doc._id).not.to.equal(undefined);
        expect(docs.rows[1].doc.value).to.equal('Hello again');

        expect(docs.rows[2].doc._id).not.to.equal(undefined);
        expect(docs.rows[2].doc.value).to.equal('Hey');

        debug('collection partitions: getlist finished');
        done();
      });
    };

    // Get a list of docs from the partitioned db, use partitions
    // 2 and 3 to test error handling
    const geterr = (done) => {
      debug('collection partitions: starting geterr ...');
      db.allDocs({
        include_docs: true,
        keys: [
          blahKey,
          awwwwKey
        ]
      }, (err, doc) => {
        expect(err).to.equal(berr);

        debug('collection partitions: geterr finished');
        done();
      });
    };

    // Get a range of docs back from the db
    const getrange = (done) => {
      debug('collection partitions: starting getrange ...');
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

        debug('collection partitions: getrange finished');
        done();
      });
    };

    // Get a range of docs from the partitioned db, use partitions
    // 2 and 3 to test error handling
    const getrangeerr = (done) => {
      debug('collection partitions: starting getrangeerr ...');
      db.allDocs({
        include_docs: true,
        startkey: dbops.kturi('Blah', moment.utc(
          '2014-10-05 19:06:54').valueOf()),
        endkey: dbops.kturi('Blah', moment.utc(
          '2014-12-07 19:07:54').valueOf())
      }, (err, docs) => {
        expect(err).to.equal(berr);

        debug('collection partitions: getrangeerr finished');
        done();
      });
    };

    clean(() => put(() => get(() =>
      clean(() => putlist(() => puterr(() => getlist(() => geterr(() =>
        getrange(() => getrangeerr(done))))))))));
  });

  context('range test', () => {

    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT !== 'abacus-mongoclient')
        this.skip();
    });

    const part = partition.partitioner(partition.bucket, partition.period,
      partition.forward, partition.balance, true);
    const db = batch(dbclient(part,
      dbclient.dburi(dbservers(), 'abacus-mongoclient-range-test')));

    const keys = ['a', 'b', 'c', 'd'];
    const docs = flatten(map(keys, (k) =>
      map(range(1417144014000, 1417576014000, 86400000), (t) =>
        dbops.tkuri(k, dbops.pad16(t))
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

    // Put docs
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
          _id: key,
          value: key.split('/')[3]
        }, (err, doc) => {
          expect(err).to.equal(null);
          cb(expect(doc.id).to.equal(key));
        });
      });
    };

    context('of allDocs', () => {
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

      it('should return the corresponding docs', (done) => {
        clean(db, () => put(db, () => get(db, done)));
      });
    });

    context('of distinctValues', () => {
      const getDistinct = (db, done) => {
        debug('range test: starting getDistinct ...');
        let cbs = 0;
        const cb = () => {
          if(++cbs === 3) {
            debug('range test: getDistinct finished');
            done();
          }
        };

        db.distinctValues('value', {
          startkey: 't/0001417144014000',
          endkey: 't/0001417403214000'
        }, (err, docs) => {
          expect(err).to.equal(null);
          expect(docs.sort()).to.deep.equal(['a', 'b', 'c', 'd']);
          cb();
        });

        db.distinctValues('invalidKey', {
          startkey: 't/0001417144014000',
          endkey: 't/0001417403214000'
        }, (err, docs) => {
          expect(err).to.equal(null);
          expect(docs.sort()).to.deep.equal([]);
          cb();
        });

        db.distinctValues('value', {
          keys: [
            't/0001417316814000/k/a',
            't/0001417316814000/k/b',
            't/0001417230414000/k/c',
            't/0001417230414000/k/d',
            't/0001417230414000/k/b'
          ]
        }, (err, docs) => {
          expect(err).to.equal(null);
          expect(docs.sort()).to.deep.equal(['a', 'b', 'c', 'd']);
          cb();
        });
      };

      // Run the above steps
      it('should return the corresponding docs', (done) => {
        clean(db, () => put(db, () => getDistinct(db, done)));
      });
    });

  });

  context('when dropping databases and partitions', () => {
    before(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT !== 'abacus-mongoclient')
        this.skip();
    });

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

    const regex = /^abacus-mongoclient-/;

    // Remove any remaining docs from possibly failed test runs
    const clean = (db, done) => {
      const cb = cbfn(3, done);

      db.get(helloKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(helloAgainKey,
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(heyKey, (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Store the documents in the database
    const put = (db, done) => {
      const cb = cbfnexpect(3, (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc.id).to.not.equal(undefined);
      }, done);

      db.put({
        id: helloKey,
        value: 'Hello',
        doc: document
      }, cb);
      db.put({
        id: helloAgainKey,
        value: 'Hello again',
        doc: document
      }, cb);
      db.put({
        id: heyKey,
        value: 'Hey',
        doc: document
      }, cb);
    };

    // Verify that the documents are present
    const get = (db, done) => {
      const cb = cbfnexpect(3, (err, doc) => {
        expect(err).to.equal(null);
        expect(doc).to.not.equal(undefined);
        expect(doc._id).to.not.equal(undefined);
      }, done);

      db.get(helloKey, cb);
      db.get(helloAgainKey, cb);
      db.get(heyKey, cb);
    };

    // Check that only some of the documents are present
    const check = (db, ids, done) => {
      const cb = cbfnexpect(3, (err, doc) => {
        if (doc && contains(ids, doc.id)) {
          expect(err).to.equal(null);
          expect(doc).to.not.equal(undefined);
          expect(doc._id).to.not.equal(undefined);
        }
        else {
          expect(err).to.equal(null);
          expect(doc).to.equal(undefined);
        }
      }, done);

      db.get(helloKey, cb);
      db.get(helloAgainKey, cb);
      db.get(heyKey, cb);
    };

    // Drop the database
    const drop = (done) => {
      dbclient.drop(dbservers(), regex, (err) => {
        expect(err).to.equal(null);
        done();
      });
    };

    // Delete partitions
    const deletePartitions = (servers, done) => {
      dbclient.deletePartitions(servers, regex, (err) => {
        expect(err).to.equal(null);
        done();
      });
    };

    const dbname = 'abacus-mongoclient-test-drop';

    const getdb = (servers) =>
      batch(dbclient(undefined, dbclient.dburi(servers, dbname)));

    it('drops all databases', (done) => {
      const db = getdb(dbservers());
      clean(db, () => put(db, () => get(db, () => drop(() =>
        check(db, [], done)))));
    });

    it('drops all databases and checks with a new connection', (done) => {
      const db = getdb(dbservers());
      clean(db, () => put(db, () => get(db, () => drop(() => {
        const newdb = getdb(dbservers());
        check(newdb, [], done);
      }))));
    });

    it('deletes all partitions that are databases', (done) => {
      const db = getdb(dbservers());
      clean(db, () => put(db, () => get(db, () =>
        deletePartitions(dbservers(), () => check(db, [], done)))));
    });

    it('deletes only the filtered partitions that are databases', (done) => {
      const db = getdb(dbservers());
      clean(db, () => put(db, () => get(db, () =>
        dbclient.deletePartitions(dbservers(), /.*-201410/, () => check(db,
         [helloKey, helloAgainKey], done)))));
    });

    it('deletes all partitions that are collections', (done) => {
      const servers = [dbserver() + '/abacus-mongoclient-0'];
      const db = getdb(servers);
      clean(db, () => put(db, () => get(db, () =>
        deletePartitions(servers, () => check(db, [], done)))));
    });

    it('deletes only the filtered partitions that are collections', (done) => {
      const servers = [dbserver() + '/abacus-mongoclient-0'];
      const db = getdb(servers);
      clean(db, () => put(db, () => get(db, () =>
        dbclient.deletePartitions(servers, /.*-201411/, () => check(db,
          [heyKey], done)))));
    });

    it('on connection error, propagates the error', (done) => {
      const db = getdb(dbservers());
      clean(db, () => put(db, () => get(db, () => {
        const original = mongoConnectSpy;
        mongoConnectSpy = spy((server, options, cb) => {
          cb('connection error');
        });
        dbclient.deletePartitions(dbservers(), regex, (err) => {
          expect(err).to.equal('connection error');
          mongoConnectSpy = original;
          done();
        });
      })));
    });

  });

});
