'use strict';

// Small utility that provides a subset of the MongoDB API over a set of DB
// partitions

const _ = require('underscore');
const sample = _.sample;
const partition = require('abacus-partition');
const batch = require('abacus-batch');
const dbclient = require('..');

/* eslint handle-callback-err: 0 */

const dbserver = () => process.env.COUCHDB || 'mongodb://localhost:27017';

describe('abacus-dbclient', () => {
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
      }), dbclient.dburi(dbserver(), 'dbclient-test'), (uri, opt, cb) => {
        // Cause DB handler errors on DB partition 2-201411
        return /dbclient-test-2-201411/.test(uri) ? cb(perr) :
          dbclient.dbcons(uri, opt, cb);
      });

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Put some docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      db.put({
        id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        value: 'Hello again'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: dbclient.tkuri('Hey', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hey'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: dbclient.kturi('Blah', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Blah'
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.put({
        id: dbclient.kturi('Awwww', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Awwww'
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Get the docs back from the db
    let hellodoc;
    let hello2doc;
    let heydoc;
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1 and the reported errors on partitions 2 and 3
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')), (err, doc) => {
        hellodoc = doc;
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')), (err, doc) => {
        hello2doc = doc;
        cb(expect(doc.value).to.equal('Hello again'));
      });
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')), (err, doc) => {
        heydoc = doc;
        cb(expect(doc.value).to.equal('Hey'));
      });
      db.get(dbclient.kturi('Blah', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(dbclient.kturi('Awwww', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Remove the docs from the db
    const remove = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      // Expect no errors on partitions 0 and 1 and the reported errors
      // on partitions 2 and 3
      db.remove(hellodoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(hello2doc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(heydoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove({
        id: dbclient.kturi('Blah', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'))
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.remove({
        id: dbclient.kturi('Awwww', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'))
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Attempt to get the docs back from the db again
    const getagain = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      // Expect the docs to not be found, and the reported errors on
      // partitions 2 and 3
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(dbclient.kturi('Blah', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(dbclient.kturi('Awwww', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Run all the above steps
    clean(() => put(() => get(() => remove(() => getagain(done)))));
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
      }), dbclient.dburi(dbserver(), 'dbclient-test'), (uri, opt, cb) => {
        // Cause DB handler errors on DB partition 2-201411
        return /dbclient-test-2-201411/.test(uri) ? cb(perr) :
          dbclient.dbcons(uri, opt, cb);
      }));

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Put some docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      db.put({
        id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        value: 'Hello again'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: dbclient.tkuri('Hey', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hey'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        id: dbclient.kturi('Blah', Date.parse(
         'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Blah'
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.put({
        id: dbclient.kturi('Awwww', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Awwww'
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Get the docs back from the db
    let hellodoc;
    let hello2doc;
    let heydoc;
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1 and the reported errors on partitions 2 and 3
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')), (err, doc) => {
        hellodoc = doc;
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get(dbclient.kturi('Hello',
        Date.parse('Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')), (err, doc) => {
        hello2doc = doc;
        cb(expect(doc.value).to.equal('Hello again'));
      });
      db.get(dbclient.tkuri('Hey',
        Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')), (err, doc) => {
        heydoc = doc;
        cb(expect(doc.value).to.equal('Hey'));
      });
      db.get(dbclient.kturi('Blah',
        Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
          (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(dbclient.kturi('Awwww', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Remove the docs from the db
    const remove = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      // Expect no errors on partitions 0 and 1 and the reported errors
      // on partitions 2 and 3
      db.remove(hellodoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(hello2doc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(heydoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove({
        id: dbclient.kturi('Blah', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'))
      }, (err, doc) => cb(expect(err).to.equal(berr)));
      db.remove({
        id: dbclient.kturi('Awwww', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'))
      }, (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Attempt to get the docs back from the db again
    const getagain = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 5) done();
      };

      // Expect notfound errors and reported errors on partitions 2 and 3
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get(dbclient.kturi('Blah', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(berr)));
      db.get(dbclient.kturi('Awwww', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(err).to.equal(perr)));
    };

    // Run all the above steps
    clean(() => put(() => get(() => remove(() => getagain(done)))));
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
      }), dbclient.dburi(dbserver(), 'dbclient-testbulk'), (uri, opt, cb) => {
        // Cause DB handler errors on DB partition 2-201411
        return /dbclient-testbulk-2-201411/.test(uri) ? cb(perr) :
          dbclient.dbcons(uri, opt, cb);
      });

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? db.remove(doc, cb) : cb(err, doc));
    };

    // Put a list of docs into the partitioned db. The doc keys will be
    // distributed to specific partitions out of 4 default partitions
    const putlist = (done) => {
      db.bulkDocs([{
        id: dbclient.kturi('Hello', Date.parse(
            'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hello'
      },
        {
          id: dbclient.kturi('Hello', Date.parse(
            'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
          value: 'Hello again'
        },
        {
          id: dbclient.tkuri('Hey', Date.parse(
            'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
          value: 'Hey'
        }], {}, (err, doc) => done(expect(err).to.equal(null)));
    };

    // Put a list of docs into the partitioned db, use partitions
    // 2 and 3 to test error handling
    const puterr = (done) => {
      db.bulkDocs([{
        id: dbclient.kturi('Blah', Date.parse(
            'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Blah'
      },
        {
          id: dbclient.kturi('Awwww', Date.parse(
            'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
          value: 'Awwww'
        }], {}, (err, docs) => done(expect(err).to.equal(berr)));
    };

    // Get the docs back from the db
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      // Expect to get the documents previously put into the db in
      // partitions 0 and 1
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc.value).to.equal('Hello')));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc.value).to.equal('Hello again')));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc.value).to.equal('Hey')));
    };

    // Get a list of docs back from the db
    const getlist = (done) => {
      // Expect to get the requested docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        keys: [
          dbclient.kturi('Hello', Date.parse(
            'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
          dbclient.kturi('Hello', Date.parse(
            'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
          dbclient.tkuri('Hey', Date.parse(
            'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'))
        ]
      }, (err, docs) => {
        expect(docs.rows.length).to.equal(3);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[1].doc.value).to.equal('Hello again');
        expect(docs.rows[2].doc.value).to.equal('Hey');
        done();
      });
    };

    // Get a list of docs from the partitioned db, use partitions
    // 2 and 3 to test error handling
    const geterr = (done) => {
      db.allDocs({
        include_docs: true,
        keys: [
          dbclient.kturi('Blah', Date.parse(
            'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
          dbclient.kturi('Awwww', Date.parse(
            'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'))
        ]
      }, (err, doc) => done(expect(err).to.equal(berr)));
    };

    // Get a range of docs back from the db
    const getrange = (done) => {
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        startkey: dbclient.kturi('Hello', Date.parse(
          'Sun Oct 05 2014 19:06:54 GMT-0800 (PST)')),
        endkey: dbclient.kturi('Hello', Date.parse(
          'Sun Dec 07 2014 19:07:54 GMT-0800 (PST)'))
      }, (err, docs) => {
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        expect(docs.rows[1].doc.value).to.equal('Hello again');
        done();
      });
    };

    // Get a range of docs metadata back from the db without the values
    const getnodocs = (done) => {
      const helloKey = dbclient.kturi('Hello', Date.parse(
        'Sun Oct 05 2014 19:06:54 GMT-0800 (PST)'));
      const helloAgainKey = dbclient.kturi('Hello', Date.parse(
        'Sun Dec 07 2014 19:07:54 GMT-0800 (PST)'));

      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: false,
        startkey: helloKey,
        endkey: helloAgainKey
      }, (err, docs) => {
        expect(docs.rows.length).to.equal(2);
        expect(docs.rows[0].doc.value).to.equal(undefined);
        expect(docs.rows[1].doc.value).to.equal(undefined);
        done();
      });
    };

    // Get a limited range of docs back from the db
    const getlimit = (done) => {
      // Expect to get the requested range of docs from partitions 0 and 1
      db.allDocs({
        include_docs: true,
        limit: 1,
        startkey: dbclient.kturi('Hello', Date.parse(
          'Sun Oct 05 2014 19:06:54 GMT-0800 (PST)')),
        endkey: dbclient.kturi('Hello', Date.parse(
          'Sun Dec 07 2014 19:07:54 GMT-0800 (PST)'))
      }, (err, docs) => {
        expect(docs.rows.length).to.equal(1);
        expect(docs.rows[0].doc.value).to.equal('Hello');
        done();
      });
    };

    // Get a range of docs from the partitioned db, use partitions
    // 2 and 3 to test error handling
    const getrangeerr = (done) => {
      db.allDocs({
        include_docs: true,
        startkey: dbclient.kturi('Blah', Date.parse(
          'Sun Oct 05 2014 19:06:54 GMT-0800 (PST)')),
        endkey: dbclient.kturi('Blah', Date.parse(
          'Sun Dec 07 2014 19:07:54 GMT-0800 (PST)'))
      }, (err, docs) => {
        expect(err).to.equal(berr);
        done();
      });
    };

    // Run the above steps
    clean(() => putlist(() => puterr(() => get(() => getlist(() =>
      geterr(() => getrange(() => getnodocs(() => getlimit(() =>
        getrangeerr(done))))))))));
  });

  it('can construct a default partitioned db handle', (done) => {
    // Try to read docs to test db connection
    const read = (db, done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3 || cbs === 6) done();
      };

      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(err, doc));
      db.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(err, doc));
      db.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(err, doc));
    };

    const noParams = (done) => {
      const db = dbclient();
      expect(db).to.not.equal(undefined);
      read(db, done);
    };

    const uriOnly = (done) => {
      const db = dbclient(undefined, dbserver);
      expect(db).to.not.equal(undefined);
      read(db, done);
    };

    noParams(() => uriOnly(done));
  });

});

