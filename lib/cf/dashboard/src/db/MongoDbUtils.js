'use strict';

const dbCtrl = require('../db').dbController;
const mongodb = require('mongodb');
const fs = require('fs');
const DbUtilsInterface = require('./DbUtilsInterface');

class MongoDbUtils extends DbUtilsInterface {
  constructor() {
    super();
  }

  upsert(collName, param1, param2, cb) {
    dbCtrl.getDbHandle().then((db) => {
      db.collection(collName).update(param1, param2, {
        upsert: true
      }, (err, result) => {
        if (err) return cb(err,null);
        db.close();
        return cb(null, result);
      });
    });
  }

  fetchRecords(collName, filterObj, cb) {
    dbCtrl.getDbHandle().then((db) => {
      db.collection(collName).find(filterObj).toArray((err, result) => {
        if (err) return cb(err,null);
        db.close();
        return cb(null, result);
      });
    });
  }

  removeRecords(collName, filterObj, cb) {
    dbCtrl.getDbHandle().then((db) => {
      db.collection(collName).remove(filterObj, (err ,result) => {
        if(err) return cb(err,null);
        db.close();
        return cb(null,result);
      });
    });
  }

  saveCSSToDB(filePath, fileName,options, cb) {
    dbCtrl.getDbHandle().then(function(db) {
      let bucket = new mongodb.GridFSBucket(db);
      fs.createReadStream(filePath).
        pipe(bucket.openUploadStream(fileName,options)).
        on('error', function(error) {
          return cb(error,null);
        }).
        on('finish', function() {
          return cb(null,{ 'message' : 'file saved' });
        });
    });
  }

  getCSSFromDB(themeId, cb) {
    dbCtrl.getDbHandle().then(function(db) {
      let bucket = new mongodb.GridFSBucket(db);
      let downloadStream = bucket.openDownloadStream(themeId);
      let str = '';
      downloadStream.on('data', function(data) {
        let temp = data.toString('utf8');
        str += temp;
      });
      downloadStream.on('end', function() {
        return cb(null, {
          'message': 'streaming complete for theme file',
          'data' : str
        });        
      });
    });
  }
}

module.exports = MongoDbUtils;
