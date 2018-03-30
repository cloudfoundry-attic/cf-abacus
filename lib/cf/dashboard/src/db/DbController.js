'use strict';
const Promise = require('bluebird');
const dbClient = require('abacus-dbclient');
const config = require('../config');
const _ = require('underscore');
const session = require('express-session');
const debug = require('abacus-debug')('abacus-dashboard');
const dbClientId = process.env.DBCLIENT || 'abacus-couchclient';
const isMongoClient = dbClientId === 'abacus-mongoclient';
const storeId = isMongoClient ? 'connect-mongo' : 'abacus-couchstore';
const sessionStore = require(storeId)(session);


const dbalias = process.env.DBALIAS || 'db';
class DbController {
  constructor() { }

  getDBUri() {
    if (_.isArray(config.uris()[dbalias]))
      return config.uris()[dbalias][0];
    return config.uris()[dbalias];

  }

  getDbHandle() {
    const dbConsify = Promise.promisify(dbClient.dbcons);
    return dbConsify(this.getDBUri(),{});
  }

  isMongoClient() {
    return isMongoClient;
  }

  getSessionStore() {
    debug('Setting Auto clear interval to %s minutes ',
      config.cf.auto_remove_interval || 10);
    if (this.isMongoClient()) {
      debug('Setting mongo client');
      return this.getStore({
        dbPromise: this.getDbHandle(),
        collection: 'abacus-service-dashboard',
        autoRemove: 'interval',
        autoRemoveInterval: config.cf.auto_remove_interval || 10
      });
    }

    let store = this.getStore({
      dbUri: this.getDBUri(),
      dbName: 'abacus-service-dashboard',
      autoRemoveInterval: (config.cf.auto_remove_interval || 10) * 60 * 1000
    });
    return store;
  }
  getStore(storeObj) {
    return new sessionStore(storeObj);
  }

}

module.exports = DbController;
