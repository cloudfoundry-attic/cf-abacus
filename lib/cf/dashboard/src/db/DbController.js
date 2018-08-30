'use strict';
const Promise = require('bluebird');
const dbClient = require('abacus-dbclient');
const config = require('../config');
const _ = require('underscore');
const session = require('express-session');
const debug = require('abacus-debug')('abacus-dashboard');
const sessionStore = require('connect-mongo')(session);

class DbController {
  constructor() { }

  getDBUri() {
    return config.uris().db_uri;
  }

  getDbHandle() {
    const dbConsify = Promise.promisify(dbClient.dbcons);
    return dbConsify(this.getDBUri(),{});
  }

  getSessionStore() {
    debug('Setting Auto clear interval to %s minutes ', config.cf.auto_remove_interval || 10);
    debug('Setting mongo client');
    return this.getStore({
      dbPromise: this.getDbHandle(),
      collection: 'abacus-service-dashboard',
      autoRemove: 'interval',
      autoRemoveInterval: config.cf.auto_remove_interval || 10
    });
  }

  getStore(storeObj) {
    return new sessionStore(storeObj);
  }
}

module.exports = DbController;
