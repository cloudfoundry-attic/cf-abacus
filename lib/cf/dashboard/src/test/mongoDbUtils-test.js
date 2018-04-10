'use strict';
/* eslint-disable max-len*/
require('./lib/index.js');

const MongoDbUtils = require('../db/MongoDbUtils');
const dbUtilsObj = new MongoDbUtils();
const dbCtrl = require('../db').dbController;
const Promise = require('bluebird');
const path = require('path');
const fs = require('fs');

describe('MongoDbUtils upsert success', () => {
  let dbHandleStb, cb, utilsSpy;
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'upsert');
    cb = function(err, res) {};
    let update = function(p1, p2, p3, cb) {
      return cb(null, 'success operation');
    };
    let collection = function() {
      return {
        'update': update
      };
    };
    let close = function() {

    };
    let db = {
      'collection': collection,
      'close': close
    };
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
  });
  it('upserts successfully', (done) => {
    dbUtilsObj.upsert('test', 'param1', 'param2', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils upsert failure', () => {
  let dbHandleStb, cb, utilsSpy;
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'upsert');
    cb = function(err, res) {};
    let update = function(p1, p2, p3, cb) {
      return cb('Some Error', null);
    };
    let collection = function() {
      return {
        'update': update
      };
    };
    let close = function() {

    };
    let db = {
      'collection': collection,
      'close': close
    };
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
  });
  it('could not upsert', (done) => {
    dbUtilsObj.upsert('test', 'param1', 'param2', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils fetchRecords failure', () => {
  let dbHandleStb, cb, utilsSpy;
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'fetchRecords');
    cb = function(err, res) {};
    let toArray = function(cb) {
      return cb('Some Error', null);
    };
    let find = function() {
      return {
        'toArray': toArray
      };
    };
    let collection = function() {
      return {
        'find': find
      };
    };
    let close = function() {

    };
    let db = {
      'collection': collection,
      'close': close
    };
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
  });
  it('could not upsert', (done) => {
    dbUtilsObj.fetchRecords('test', 'param1', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils fetchRecords Success', () => {
  let dbHandleStb, cb, utilsSpy;
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'fetchRecords');
    cb = function(err, res) {};
    let toArray = function(cb) {
      return cb(null, 'data');
    };
    let find = function() {
      return {
        'toArray': toArray
      };
    };
    let collection = function() {
      return {
        'find': find
      };
    };
    let close = function() {

    };
    let db = {
      'collection': collection,
      'close': close
    };
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
  });
  it('could not upsert', (done) => {
    dbUtilsObj.fetchRecords('test', 'param1', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils removeRecords Success', () => {
  let dbHandleStb, cb, utilsSpy;
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'removeRecords');
    cb = function(err, res) {};
    let remove = function(p1, cb) {
      return cb(null, 'data');
    };
    let collection = function() {
      return {
        'remove': remove
      };
    };
    let close = function() {};
    let db = {
      'collection': collection,
      'close': close
    };
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
  });
  it('removed', (done) => {
    dbUtilsObj.removeRecords('test', 'param1', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils removeRecords failure', () => {
  let dbHandleStb, cb, utilsSpy;
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'removeRecords');
    cb = function(err, res) {};
    let remove = function(p1, cb) {
      return cb('Some Error', null);
    };
    let collection = function() {
      return {
        'remove': remove
      };
    };
    let close = function() {};
    let db = {
      'collection': collection,
      'close': close
    };
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
  });
  it('could not remove', (done) => {
    dbUtilsObj.removeRecords('test', 'param1', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils saveCSSToDB Success', () => {
  let dbHandleStb, cb, utilsSpy, bucketStub;
  let mgDb = require('mongodb');
  let stream = require('stream');
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'saveCSSToDB');
    cb = function(err, res) {};
    let db = {};
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
    bucketStub = sinon.stub(mgDb, 'GridFSBucket', () => {
      return {
        openUploadStream: (param) => {
          return new stream.PassThrough();
        }
      };
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
    bucketStub.restore();
  });
  it('saved to db successfully', (done) => {
    let srcPath = path.join(__dirname + '/fixtures/testCssFile.css');
    dbUtilsObj.saveCSSToDB(srcPath, 'test', {}, cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});

describe('MongoDbUtils getCSSFromDB Success', () => {
  let dbHandleStb, cb, utilsSpy, bucketStub;
  let mgDb = require('mongodb');
  let srcPath = path.join(__dirname + '/fixtures/testCssFile.css');
  before(() => {
    utilsSpy = sinon.spy(dbUtilsObj, 'getCSSFromDB');
    cb = function(err, res) {};
    let db = {};
    dbHandleStb = sinon.stub(dbCtrl, 'getDbHandle', () => {
      return Promise.resolve(db);
    });
    bucketStub = sinon.stub(mgDb, 'GridFSBucket', () => {
      return {
        openDownloadStream: (param) => {
          return fs.createReadStream(srcPath);
        }
      };
    });
  });
  after(() => {
    dbHandleStb.restore();
    utilsSpy.restore();
    bucketStub.restore();
  });
  it('could not remove', (done) => {
    dbUtilsObj.getCSSFromDB('id', cb);
    expect(utilsSpy.calledOnce).to.equal(true);
    done();
  });
});
