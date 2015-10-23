'use strict';

// A Leveldown adapter for the popular Node LRU module.
const levelup = require('levelup');
const PouchDB = require('pouchdb');

const lrudown = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-lrudown', () => {
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

  it('implements the leveldown API', (done) => {
    const db = levelup('test-levelup', {
      db: (loc) => new lrudown(loc)
    });

    // Put some values in the db
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      db.put('hello',
        'Hello', (err, doc) => cb(expect(err).to.equal(undefined)));
      db.put('hey',
        'Hey', (err, doc) => cb(expect(err).to.equal(undefined)));
    };

    // Get the values back from the db
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect to get the values previously put in the db
      db.get('hello', (err, val) => cb(expect(val).to.equal('Hello')));
      db.get('hey', (err, val) => cb(expect(val).to.equal('Hey')));
    };

    // Remove the values from the db
    const remove = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect no errors
      db.del('hello', (err, val) => cb(expect(err).to.equal(undefined)));
      db.del('hey', (err, val) => cb(expect(err).to.equal(undefined)));
    };

    // Attempt to get the values back from the db again
    const getagain = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect the docs to not be found
      db.get('hello', (err, val) => cb(expect(val).to.equal(undefined)));
      db.get('hey', (err, val) => cb(expect(val).to.equal(undefined)));
    };

    // Run all the above steps
    put(() => get(() => remove(() => getagain(done))));
  });

  it('can be used as a leveldown db adapter', (done) => {
    const db = new PouchDB('test-store', {
      db: lrudown
    });

    // Put some docs into the db
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      db.put({
        _id: 'hello',
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        _id: 'hey',
        value: {
          greeting: 'Hey'
        }
      }, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Get the docs back from the db
    let hellodoc;
    let heydoc;
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect to get the documents previously put into the db
      db.get('hello', (err, doc) => {
        hellodoc = doc;
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get('hey', (err, doc) => {
        heydoc = doc;
        cb(expect(doc.value.greeting).to.equal('Hey'));
      });
    };

    // Remove the docs from the db
    const remove = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect no errors
      db.remove(hellodoc, (err, doc) => cb(expect(err).to.equal(null)));
      db.remove(heydoc, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Attempt to get the docs back from the db again
    const getagain = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect the docs to not be found
      db.get('hello', (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get('hey', (err, doc) => cb(expect(doc).to.equal(undefined)));
    };

    // Run all the above steps
    put(() => get(() => remove(() => getagain(done))));
  });

  it('evicts cached entries after some time', (done) => {
    const db = new PouchDB('test-evict', {
      db: lrudown
    });

    // Put some docs into the db
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      db.put({
        _id: 'hello',
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        _id: 'hey',
        value: {
          greeting: 'Hey'
        }
      }, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Get the docs back from the db
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect to get the documents previously put into the db
      db.get('hello', (err, doc) => {
        cb(expect(doc.value).to.equal('Hello'));
      });
      db.get('hey', (err, doc) => {
        cb(expect(doc.value.greeting).to.equal('Hey'));
      });
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
        if(++cbs === 2) done();
      };

      // Expect the docs to not be found
      db.get('hello', (err, doc) => cb(expect(doc).to.equal(undefined)));
      db.get('hey', (err, doc) => cb(expect(doc).to.equal(undefined)));
    };

    // Run all the above steps
    put(() => get(() => advance(() => getagain(done))));
  });

  it('implements db lifecycle functions', (done) => {
    const db = new PouchDB('test-lifecycle', {
      db: lrudown
    });

    // Put some docs into the db
    const put = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      db.put({
        _id: 'hello',
        value: 'Hello'
      }, (err, doc) => cb(expect(err).to.equal(null)));
      db.put({
        _id: 'hey',
        value: {
          greeting: 'Hey'
        }
      }, (err, doc) => cb(expect(err).to.equal(null)));
    };

    // Get the docs back from the db, using a different db handle
    const get = (done) => {
      const db2 = new PouchDB('test-lifecycle', {
        db: lrudown
      });

      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect to get the documents previously put into the db
      db2.get('hello', (err, doc) => {
        cb(expect(doc.value).to.equal('Hello'));
      });
      db2.get('hey', (err, doc) => {
        cb(expect(doc.value.greeting).to.equal('Hey'));
      });
    };

    // Destroy the db
    const destroy = (done) => {
      db.destroy(done);
    };

    // Attempt to get the docs back from the db again, using a new db
    // handle
    const getagain = (done) => {
      const db3 = new PouchDB('test-lifecycle', {
        db: lrudown
      });

      let cbs = 0;
      const cb = () => {
        if(++cbs === 2) done();
      };

      // Expect the docs to not be found
      db3.get('hello', (err, doc) => cb(expect(doc).to.equal(undefined)));
      db3.get('hey', (err, doc) => cb(expect(doc).to.equal(undefined)));
    };

    // Run all the above steps
    put(() => get(() => destroy(() => getagain(done))));
  });
});

