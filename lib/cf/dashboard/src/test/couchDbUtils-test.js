'use strict';
/* eslint-disable max-len*/
require('./lib/index.js');

const CouchDbUtils = require('../db/CouchDbUtils');
const dbUtilsObj = new CouchDbUtils();
const path = require('path');

describe('check dbclient', () => {
  describe('couchclient dbhandle', () => {
    let utilsSpy;
    let dbname = 'test';
    before(() => {
      require('abacus-dbclient');
      require.cache[require.resolve('abacus-dbclient')].exports = {
        'testConn' : 'testConnn'
      };
      utilsSpy = sinon.spy(dbUtilsObj, 'getDbHandle');
    });
    after(() => {
      utilsSpy.restore();
      delete require.cache[require.resolve('abacus-dbclient')];
    });
    it('check getdbHandle Method', (done) => {
      dbUtilsObj.getDbHandle(dbname);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient fetchRecords', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let get = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'get' : get
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'fetchRecords');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check fetchRecords  Method, success', (done) => {
      dbUtilsObj.fetchRecords('testdb',{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient fetchRecords', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let get = (p1,cb) => {
        return cb({ 'error':'some error' },null);
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'get' : get
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'fetchRecords');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check fetchRecords  Method, failure', (done) => {
      dbUtilsObj.fetchRecords('testdb',{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient fetchRecords', () => {
    let utilsSpy,cb;
    cb = function(err, res) {};
    let get = (p1,cb) => {
      return cb(null,{ 'data':'dataaaa' });
    };
    let list = (p1,cb) => {
      let obj = {
        'rows' : [
          {
            'doc' : {
              'metadata' : {
                'email' : 'testmail'
              },
              'filename' : 'testfilename'
            }
          }
        ]
      };
      return cb(null,obj);
    };
    let create = () => {
      return cb(null,'testdbname');
    };
    let use = (name) => {
      return{
        'list' : list
      };
    };
    const nano = function() {
      return {
        'db' : {
          'get' : get,
          'list' : list,
          'create' : create,
          'use' : use
        }
      };
    };
    before(() => {
      require('nano');
      require.cache[require.resolve('nano')].exports = nano;
      utilsSpy = sinon.spy(dbUtilsObj, 'fetchRecords');
    });
    after(() => {
      utilsSpy.restore();
      delete require.cache[require.resolve('nano')];
    });
    it('check fetchRecords  for fs.files collection', (done) => {
      let fileterObj = {
        'metadata' : {
          'email' : 'testmail'
        },
        'filename' : 'testfilename'
      };
      dbUtilsObj.fetchRecords('fs.files',fileterObj,cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient upsert', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let query = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let put = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let get = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let remove = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'put' : put,
          'query' : query,
          'get' : get,
          'remove' : remove
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'upsert');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check upsert  Method, success', (done) => {
      dbUtilsObj.upsert('testdb',{ 'email':'email' },{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient upsert , new document creation', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let query = (p1,cb) => {
        return cb({ 'error' : 'no doc' },null);
      };
      let put = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let get = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let remove = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'put' : put,
          'query' : query,
          'get' : get,
          'remove' : remove
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'upsert');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check upsert  Method, success', (done) => {
      dbUtilsObj.upsert('testdb',{ 'email':'email' },{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient upsert', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let query = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let put = (p1,cb) => {
        return cb({ 'error' : 'remove fails' },null);
      };
      let get = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let remove = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'put' : put,
          'query' : query,
          'get' : get,
          'remove' : remove
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'upsert');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check upsert  Method, failure', (done) => {
      dbUtilsObj.upsert('testdb',{ 'email':'email' },{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient remove', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let get = (p1,cb) => {
        return cb(null,{ 'data':'data' });
      };
      let remove = (p1,cb) => {
        return cb({ 'error' : 'remove fails' },null);
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'get' : get,
          'remove' : remove
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'removeRecords');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check removeRecords  Method, success', (done) => {
      dbUtilsObj.removeRecords('testdb',{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient remove', () => {
    let utilsSpy,getDbHandleStb,cb;
    before(() => {
      cb = function(err, res) {};
      let get = (p1,cb) => {
        return cb({ 'error' : 'error' },null);
      };
      let remove = (p1,cb) => {
        return cb({ 'error' : 'remove fails' },null);
      };
      getDbHandleStb = sinon.stub(dbUtilsObj,'getDbHandle',()=>{
        return {
          'get' : get,
          'remove' : remove
        };
      });
      utilsSpy = sinon.spy(dbUtilsObj, 'removeRecords');
    });
    after(() => {
      utilsSpy.restore();
      getDbHandleStb.restore();
    });
    it('check removeRecords  Method, failure', (done) => {
      dbUtilsObj.removeRecords('testdb',{ 'email':'email' },cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient saveCSS to DB', () => {
    let utilsSpy,cb;
    let stream = require('stream');
    cb = function(err, res) {};
    let get = (p1,cb) => {
      return cb('some error',null);
    };
    let create = (testdbname,cb) => {
      return cb(null,'testdbname');
    };
    let insert = (p1,cb) => {
      return cb(null , { 'rev' : 'dummyrev123' });
    };
    let attInsert = () => {
      return new stream.PassThrough();
    };
    let use = (name) => {
      return{
        'insert' : insert,
        'attachment' : {
          'insert' : attInsert
        }
      };
    };
    const nano = function() {
      return {
        'db' : {
          'get' : get,
          'insert' : insert,
          'create' : create,
          'use' : use
        }
      };
    };
    before(() => {
      require('nano');
      require.cache[require.resolve('nano')].exports = nano;
      utilsSpy = sinon.spy(dbUtilsObj, 'saveCSSToDB');
    });
    after(() => {
      utilsSpy.restore();
      delete require.cache[require.resolve('nano')];
    });
    it('check save css to db', (done) => {
      let srcPath = path.join(__dirname + '/fixtures/testCssFile.css');
      dbUtilsObj.saveCSSToDB(srcPath, 'test', {}, cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient getCSS from DB', () => {
    let utilsSpy,cb;
    cb = function(err, res) {};
    let get = (p1,cb) => {
      return cb('some error',{ 'filename' : 'test' });
    };
    let create = (testdbname,cb) => {
      return cb(null,'testdbname');
    };
    let attGet = (p1,p2,cb) => {
      return cb(null,'dummydata');
    };
    let use = (name) => {
      return{
        'attachment' : {
          'get' : attGet
        },
        'get' : get
      };
    };
    const nano = function() {
      return {
        'db' : {
          'get' : get,
          'create' : create,
          'use' : use
        }
      };
    };
    before(() => {
      require('nano');
      require.cache[require.resolve('nano')].exports = nano;
      utilsSpy = sinon.spy(dbUtilsObj, 'getCSSFromDB');
    });
    after(() => {
      utilsSpy.restore();
      delete require.cache[require.resolve('nano')];
    });
    it('couchclient getCSS from DB', (done) => {
      dbUtilsObj.getCSSFromDB('id', cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('couchclient getCSS from DB fails', () => {
    let utilsSpy,cb;
    cb = function(err, res) {};
    let get = (p1,cb) => {
      return cb('some error',{ 'filename' : 'test' });
    };
    let create = (testdbname,cb) => {
      return cb(null,'testdbname');
    };
    let attGet = (p1,p2,cb) => {
      return cb('some error','dummydata');
    };
    let use = (name) => {
      return{
        'attachment' : {
          'get' : attGet
        },
        'get' : get
      };
    };
    const nano = function() {
      return {
        'db' : {
          'get' : get,
          'create' : create,
          'use' : use
        }
      };
    };
    before(() => {
      require('nano');
      require.cache[require.resolve('nano')].exports = nano;
      utilsSpy = sinon.spy(dbUtilsObj, 'getCSSFromDB');
    });
    after(() => {
      utilsSpy.restore();
      delete require.cache[require.resolve('nano')];
    });
    it('couchclient getCSS from DB', (done) => {
      dbUtilsObj.getCSSFromDB('id', cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });

  describe('getDbForAttachment', () => {
    let utilsSpy,cb;
    cb = function(err, res) {};
    let get = (p1,cb) => {
      return cb('some error',{ 'filename' : 'test' });
    };
    let create = (testdbname,cb) => {
      return cb('some error','testdbname');
    };
    let use = (name) => {
      return{
        'get' : get
      };
    };
    const nano = function() {
      return {
        'db' : {
          'get' : get,
          'create' : create,
          'use' : use
        }
      };
    };
    before(() => {
      require('nano');
      require.cache[require.resolve('nano')].exports = nano;
      utilsSpy = sinon.spy(dbUtilsObj, 'getDbForAttachment');
    });
    after(() => {
      utilsSpy.restore();
      delete require.cache[require.resolve('nano')];
    });
    it('couchclient getDbForAttachment', (done) => {
      dbUtilsObj.getDbForAttachment('dbname', cb);
      expect(utilsSpy.calledOnce).to.equal(true);
      done();
    });
  });
});
