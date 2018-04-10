const config = require('../config');
require('abacus-dbclient');
require.cache[require.resolve('abacus-dbclient')].exports = {
  dbcons: (url, {}, cb) => {
    cb(null, url);
  }
};

let storeStub = sinon.stub();
const store = (connect) => {
  class MongoStore {
    constructor(options) {
      return storeStub(options);
    }
  }
  return MongoStore;
};
require('connect-mongo');
require.cache[require.resolve('connect-mongo')].exports = store;
require('abacus-couchstore');
require.cache[require.resolve('abacus-couchstore')].exports = store;

const dbController = require('../db').dbController;


describe('db controller', () => {
  let isMongoStub = sinon.stub(dbController, 'isMongoClient');
  let configUrisStub = null;
  before(() => {
    configUrisStub = sinon.stub(config, 'uris');
  });

  after(() => {
    configUrisStub.restore();
    delete require.cache[require.resolve('abacus-dbclient')];
  });

  it('calls getDBUri with url', (done) => {
    configUrisStub.returns({
      db: 'testdb'
    });
    const test = dbController.getDBUri();
    expect(test).to.equal('testdb');
    done();
  });

  // test if in production
  it('calls connectToDB with  array url', (done) => {
    configUrisStub.returns({
      db: ['testdb']
    });
    const test = dbController.getDBUri();
    expect(test).to.equal('testdb');
    done();
  });

  describe('getSessionStore' ,() => {
    let mockStoreStb,getSessionStoreSpy;
    before(()=> {
      mockStoreStb = sinon.stub(dbController , 'getStore');
      getSessionStoreSpy = sinon.spy(dbController, 'getSessionStore');
    });
    after(() => {
      mockStoreStb.restore();
      getSessionStoreSpy.restore();
    });
    it('use mongo-store for mongoclient', (done) => {
      isMongoStub.returns(true);
      mockStoreStb.returns({});
      dbController.getSessionStore();
      expect(getSessionStoreSpy.calledOnce).to.equal(true);
      done();
    });

    it('use couch-store for couchclient', (done) => {
      isMongoStub.returns(false);
      mockStoreStb.returns({});
      dbController.getSessionStore();
      expect(getSessionStoreSpy.calledTwice).to.equal(true);
      done();
    });
  });
});
