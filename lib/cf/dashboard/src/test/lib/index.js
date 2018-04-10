'use strict';

const vars = require('./test_settings.json');
const _ = require('lodash');
const session = require('express-session');
global.Promise = require('bluebird');
global.sinon = require('sinon');
global.chai = require('chai');
global.expect = global.chai.expect;
global.nock = require('nock');

/* !
 * Chai Plugins
 */
global.chai.use(require('chai-http'));

const loadSettings = () => {
  console.log('Setting environment variables for tests');
  let keys = Object.keys(vars);
  keys.forEach((k) => {
    let val = vars[k];
    if (_.isObject(val))
      process.env[k] = JSON.stringify(val);
    else
      process.env[k] = val;

  });
};

const mockAuthMiddleware = () => {
  require('../../middleware/authMiddleware');
  require.cache[require.resolve('../../middleware/authMiddleware')].exports = {
    ensureAuthenticated: (req, res, next) => {
      req.session.creds = {};
      req.session.creds.resource_id = 'sampleResourceId';
      req.session.creds.collector_url = 'http://localhost:9080';
      req.session.uaa_response = {
        parsed_token :[{},{ email : 'test' }]
      };
      next();
    },
    isAuthenticated: (req) => {
      return true;
    }
  };
};

const deleteAuthMiddlewareCache = () => {
  delete require.cache[require.resolve('../../middleware/authMiddleware')];
};

const deleteModules = () => {
  delete require.cache[require.resolve('connect-mongo')];
  delete require.cache[require.resolve('../../db')];
};

const mockDbSettings = () => {
  const mockConnectMongo = (connect) => {
    class MongoStore {
      constructor(options) {
        return new connect.MemoryStore();
      }
    }
    return MongoStore;
  };

  const mockDbClient = {
    dbController: {
      getSessionStore: () => {
        let store = mockConnectMongo(session);
        return new store();
      },
      isMongoClient : () => {
        return true;
      },
      getDBUri : () => {
        return true;
      }
    }
  };
  require('../../db');
  require.cache[require.resolve('../../db')].exports = mockDbClient;
  require('connect-mongo');
  require.cache[require.resolve('connect-mongo')].exports = mockConnectMongo;
};

process.env.NODE_ENV = 'test';
loadSettings();

module.exports.mockDbSettings = mockDbSettings;
module.exports.deleteModules = deleteModules;
module.exports.mockAuthMiddleware = mockAuthMiddleware;
module.exports.deleteAuthMiddlewareCache = deleteAuthMiddlewareCache;
