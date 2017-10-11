'use strict';
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const couchclient = require('abacus-dbclient');
const debug = require('abacus-debug')('abacus-couchstore');
const _ = require('underscore');

const connectCouch = (connect) => {
  let Store = connect.Store;

  class CouchStore extends Store {

    constructor(options) {
      super();
      let dbHandle = couchclient(partition.singleton, couchclient.dburi(
        options.dbUri, options.dbName));
      this.db = dbHandle;
      this.autoRemoveInterval = options.autoRemoveInterval;
      this.setDesignDocument();
      this._removeExpiredSession = setInterval(
        () => this.removeExpiredSession(), this.autoRemoveInterval);
    }

    set(sid, session, callback) {
      debug('couchstore set method called');
      this.db.get(sid, (err, doc) => {
        let document = null;
        if (err || !doc) {
          debug('no data found constructing document !!');
          let expires = this.getExpiryTime(session);
          document = {
            '_id': sid,
            'type': 'connect-session',
            'session': session,
            'expires': expires
          };
        }
        else{
          doc.session = session;
          document = doc;
        }
        this.db.put(document, (err, resp) => {
          if (err) {
            debug('failed to update %o', err);
            return callback(err, resp);
          }
          debug('successfully posted document');
          return callback(null, resp);
        });
      });
    }

    getExpiryTime(session) {
      debug('expiry time is %s',moment.utc(session.cookie.expires).isValid());
      if (session && session.cookie && session.cookie.expires)
        return moment.utc(session.cookie.expires).valueOf();
      // default expiry time is 15 min
      return moment.utc().add(15, 'minutes').valueOf();
    }

    get(sid, callback) {
      this.db.get(sid, (err, doc) => {
        if (err || !doc)
          return callback(err,doc);
        debug('got this data %o', doc);
        return callback(null, doc.session);
      });
    }

    destroy(sid, callback) {
      this.db.get(sid, (err, doc) => {
        if (err || !doc)
          return callback(err, doc);
        debug('destroying cookie %o', sid);
        return this.db.remove(doc, callback);
      });
    }

    touch(sid, session, callback) {
      debug('touch called ');
      this.db.get(sid, (err, doc) => {
        if (err)
          return callback(err);
        if (session && session.cookie && session.cookie.expires) {
          debug('touch session from %s to %s',
            doc.expires, session.cookie.expires);
          doc.expires = this.getExpiryTime(session);
          doc.session = session;
        }
        return this.db.put(doc, callback);
      });
    }

    setDesignDocument() {
      const createDesignDoc = () => {
        let doc = {
          _id: '_design/couchdb-session',
          'language': 'javascript',
          'views': {
            'expires': {
              'map': '(function (doc) {\n' +
                'if (doc.type == "connect-session" && doc.expires)' +
                '{\n emit(doc.expires);\n }\n })'
            }
          }
        };

        this.db.put(doc, (err) => {
          if (err)
            debug('failed to update %o', err);
          else
            debug('successfully posted design document');
        });
      };

      this.db.get('_design/couchdb-session', (err, doc) => {
        // Delete the design docs if it exists & create the new one
        if (err || _.isEmpty(doc))
          createDesignDoc();
      });
    }

    removeExpiredSession(callback) {
      debug('Remove auto interval called');
      let now = moment.utc().valueOf();
      let options = { endkey: now, reduce: false, include_docs: true };
      this.db.query('couchdb-session/expires', options, (err, resp) => {
        if (err)
          return callback && callback(err);
        return this.bulkDestroy(resp.rows, callback);
      });
    }

    unsetRemoveExpiredSession() {
      clearInterval(this._removeExpiredSession);
    }

    bulkDestroy(rows, callback) {
      debug('bulk destroy called with %o', rows);
      let deleteDocs = [];
      rows.forEach((doc) => {
        deleteDocs.push({ _id: doc.doc._id,
          _rev: doc.doc._rev, _deleted: true });
      });
      this.db.bulkDocs(deleteDocs, {}, (err, resp) => {
        if (err)
          return callback && callback(err);
        debug('deleted successfully session entries');
        return callback && callback(null,resp);
      });
    }
  }

  return CouchStore;
};

module.exports = connectCouch;
