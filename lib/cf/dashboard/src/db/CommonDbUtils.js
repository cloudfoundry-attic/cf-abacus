'use strict';

const dbCtrl = require('../db').dbController;
const isMongoClient = dbCtrl.isMongoClient();

class CommonDbUtils {
  constructor() {}

  getDbTypeInstance() {
    if (isMongoClient) {
      let MongoDbUtils = require('../db/MongoDbUtils');
      return new MongoDbUtils();
    }
    let CouchDbUtils = require('../db/CouchDbUtils');
    return new CouchDbUtils();
  }
}

module.exports = CommonDbUtils;
