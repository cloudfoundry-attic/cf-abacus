'use strict';

class CommonDbUtils {
  constructor() {}

  getDbTypeInstance() {
    let MongoDbUtils = require('../db/MongoDbUtils');
    return new MongoDbUtils();
  }
}

module.exports = CommonDbUtils;
