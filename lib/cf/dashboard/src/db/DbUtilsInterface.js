'use strict';

/* eslint-disable max-len*/

const errors = require('../utils/errors');
const NotImplemented = errors.NotImplemented;

class DbUtilsInterface {
  constructor() {}

  upsert(collName, param1, param2, cb) {
    throw new NotImplemented('Method upsert not implemented by subclass');
  }

  fetchRecords(collName, filterObj, cb) {
    throw new NotImplemented('Method fetchRecords not implemented by subclass');
  }

  removeRecords(collName, filterObj, cb) {
    throw new NotImplemented('Method removeRecords not implemented by subclass');
  }

  saveCSSToDB(filePath, fileName, options, cb) {
    throw new NotImplemented('Method saveCSSTODB not implemented by subclass');
  }

  getCSSFromDB(themeId, cb) {
    throw new NotImplemented('Method getCSSFromDB not implemented by subclass');
  }
}
module.exports = DbUtilsInterface;
