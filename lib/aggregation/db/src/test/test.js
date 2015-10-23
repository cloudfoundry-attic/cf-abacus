'use strict';

// Naming and partitioning scheme for the usage aggregation DBs.

const dbclient = require('abacus-dbclient');

const db = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-aggregation-db', () => {
  let clock;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(Date.now(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('distributes keys over several partitions', () => {
    // Get partitions for some keys and times
    const p = db.partition(4);
    p('Hello', Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([0, 201411]);
      });
    p('Hey', Date.parse(
      'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([1, 201410]);
      });
    p('Blah', Date.parse(
      'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([3, 201410]);
      });
    p('Awwww', Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([2, 201411]);
      });
  });

  it('distributes time ranges over partition ranges', () => {
    // Get partitions for a key and a range of times
    const p = db.partition(4);
    p('Hey', [Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Sat Dec 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([
        [1, 201410],
        [1, 201411],
        [1, 201412]
      ]);
    });
    p('Blah', [Date.parse('Set Dec 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([
        [3, 201412],
        [3, 201411],
        [3, 201410]
      ]);
    });
  });

  it('distributes db ops over several db partitions', (done) => {

    // Configure test db URL prefix
    process.env.COUCHDB = process.env.COUCHDB || 'test';

    // Setup an aggregation db
    const aggrdb = db.logdb(process.env.COUCHDB, 'aggregation-db');

    // Remove any remaining docs from possibly failed test runs to make
    // sure we are starting clean
    const clean = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      aggrdb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? aggrdb.remove(doc, cb) : cb(err, doc));
      aggrdb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => doc ? aggrdb.remove(doc, cb) : cb(err, doc));
      aggrdb.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => doc ? aggrdb.remove(doc, cb) : cb(err, doc));
    };

    // Put some docs into the partitioned db
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      aggrdb.put({
        _id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      aggrdb.put({
        _id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        value: 'Hello again'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      aggrdb.put({
        _id: dbclient.tkuri('Hey', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hey'
      }, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Get the docs back from the db
    let hellodoc;
    let hello2doc;
    let heydoc;
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      // Expect to get the documents previously put into the db
      aggrdb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')), (err, doc) => {
          hellodoc = doc;
          cb(expect(doc.value).to.equal('Hello'));
        });
      aggrdb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')), (err, doc) => {
          hello2doc = doc;
          cb(expect(doc.value).to.equal('Hello again'));
        });
      aggrdb.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')), (err, doc) => {
          heydoc = doc;
          cb(expect(doc.value).to.equal('Hey'));
        });
    };

    // Remove the docs from the db
    const remove = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      // Expect no errors
      aggrdb.remove(hellodoc, (err, doc) => cb(expect(err).to.equal(null)));
      aggrdb.remove(hello2doc, (err, doc) => cb(expect(err).to.equal(null)));
      aggrdb.remove(heydoc, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Attempt to get the docs back from the db again
    const getagain = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      // Expect the docs to not be found
      aggrdb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      aggrdb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      aggrdb.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
    };

    // Run all the above steps
    clean(() => put(() => get(() => remove(() => getagain(done)))));
  });

  it('evicts cached docs after some time', (done) => {
    const cachedb = db.cache('test-cache');

    // Put some docs into the partitioned db
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      cachedb.put({
        _id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      cachedb.put({
        _id: dbclient.kturi('Hello', Date.parse(
          'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        value: 'Hello again'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      cachedb.put({
        _id: dbclient.tkuri('Hey', Date.parse(
          'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        value: 'Hey'
      }, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Get the docs back from the db
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      // Expect to get the documents previously put into the db
      cachedb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc.value).to.equal('Hello')));
      cachedb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc.value).to.equal('Hello again')));
      cachedb.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc.value).to.equal('Hey')));
    };

    // Advance time to more than 5 mns later
    const advance = (done) => {
      clock.tick(1000 * 3600 * 72 + 1);
      done();
    };

    // Attempt to get the docs back from the db again
    const getagain = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 3) done();
      };

      // Expect the docs to not be found
      cachedb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      cachedb.get(dbclient.kturi('Hello', Date.parse(
        'Thu Nov 06 2014 19:07:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
      cachedb.get(dbclient.tkuri('Hey', Date.parse(
        'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')),
        (err, doc) => cb(expect(doc).to.equal(undefined)));
    };

    // Run all the above steps
    put(() => get(() => advance(() => getagain(done))));
  });
});

