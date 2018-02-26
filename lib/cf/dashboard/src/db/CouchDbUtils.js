'use strict';

/* eslint-disable max-len*/

const DbUtilsInterface = require('./DbUtilsInterface');
const partition = require('abacus-partition');
const couchclient = require('abacus-dbclient');
const dbCtrl = require('../db').dbController;
const logger = require('../utils/dashboardLogger');
const _ = require('lodash');
const fs = require('fs');
const uuidv4 = require('uuid/v4');

class CouchDbUtils extends DbUtilsInterface {
  constructor() {
    super();
  }

  getDbHandle(dbName) {
    let dbHandle = couchclient(partition.singleton, couchclient.dburi(
      dbCtrl.getDBUri(), dbName));
    return dbHandle;
  }

  fetchRecords(collName, filterObj, cb) {
    if(collName !== 'fs.files') {
      let _id = filterObj.email;
      this.getDbHandle(collName).get(_id, (err, doc) => {
        if (err || !doc)
          return cb(err, doc);
        return cb(null, [doc]);
      });
    }else
      this.getDbForAttachment('fs.files', (err,db) => {
        db.list({ 'include_docs' : true }, (err,body) => {
          let docArr = [];
          if(!err)
            body.rows.forEach(function(docs) {
              if(docs.doc.metadata.email === filterObj.metadata.email)
                docArr.push(docs.doc);
            });
          if(filterObj.filename)
            docArr = _.filter(docArr,(item) => {
              return item.filename === filterObj.filename;
            });
          return cb(null , docArr);
        });
      });
  }

  upsert(collName, param1, param2, cb) {
    let self = this;
    this.getDbHandle(collName).query(param1, (err, doc) => {
      let document = null;
      if (err || !doc) {
        logger.info('no data found constructing document !!');
        document = _.assign({
          'type': 'userPref',
          '_id': param1.email
        }, param2);
        self.removeRecords(collName,param1, (err,res) => {
          if (!err)
            self.putRecord(collName,document,(err,resp) => {
              return cb(err,resp);
            });
        });
      }else {
        document = _.assign(doc, param2);
        self.removeRecords(collName,param1, (err,res) => {
          if (!err)
            self.putRecord(collName,document,(err,resp) => {
              return cb(err,resp);
            });
        });
      }
    });
  }

  putRecord(collName,document,cb) {
    this.getDbHandle(collName).put(document, (err, resp) => {
      if (err) {
        logger.debug('failed to update %o', err);
        return cb(err, resp);
      }
      logger.info('successfully posted document');
      return cb(null, resp);
    });
  }

  /* eslint-disable consistent-return*/
  removeRecords(collName, filterObj, cb) {
    let self = this;
    let _id = filterObj.email;
    this.getDbHandle(collName).get(_id, (err, doc) => {
      if (err || !doc)
        return cb(err, doc);
      logger.info('removing theme userPref');
      self.getDbHandle(collName).remove(doc, (err,val) => {
        return cb(err,val);
      });
    });
  }

  getDbForAttachment(dbName,cb) {
    const nano = require('nano')(dbCtrl.getDBUri());
    nano.db.get(dbName, (err,db) => {
      if(!err) return cb(null,nano.db.use(dbName));
      nano.db.create(dbName,(err,db) => {
        if(!err) return cb(null,nano.db.use(dbName));
        logger.debug(`Error during getting db uri in getDbForAttachment:: ${err}`);
        return cb(err,null);
      });
    });
  }

  /* eslint-enable consistent-return*/

  saveCSSToDB(filePath, fileName, options, cb) {
    this.getDbForAttachment('fs.files',(err,db) => {
      if(!err) {
        let _id = uuidv4();
        let doc = _.extend({ '_id' : _id,'filename' : fileName },options);
        db.insert(doc, (err,body) => {
          let _rev = body.rev;
          fs.createReadStream(filePath).pipe(
            db.attachment.insert(_id, fileName, null, 'text/css',{ 'rev' : _rev })).
            on('error', function(error) {
              return cb(error,null);
            }).
            on('finish', function() {
              return cb(null,{ 'message' : 'file saved' });
            });
        });
      }
      logger.debug(`Error during getting db uri in saveCSSToDB:: ${err}`);
      return cb(err,null);
    });
  }

  getCSSFromDB(themeId, cb) {
    this.getDbForAttachment('fs.files', (err,db) => {
      if(!err)
        db.get(themeId, (err,data) => {
          let str;
          db.attachment.get(themeId, data.filename, (err, body) => {
            if (!err) {
              str = body.toString('utf-8');
              return cb(null, {
                'message': 'streaming complete for theme file',
                'data' : str
              });
            }
            logger.debug(`Error while downloading the CSS :: + ${err}`);
            return cb('Some Error While Downloading CSS',null);
          });
        });
    });
  }
}

module.exports = CouchDbUtils;
