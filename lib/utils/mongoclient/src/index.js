'use strict';

// Small utility that provides a subset of the MongoDB API over a set of DB
// partitions

const _ = require('underscore');
const partition = require('abacus-partition');
const transform = require('abacus-transform');
const request = require('abacus-request');
const perf = require('abacus-perf');
const mongoDB = require('mongodb').MongoClient;
const url = require('url');

const values = _.values;
const groupBy = _.groupBy;
const sortBy = _.sortBy;
const map = _.map;
const flatten = _.flatten;
const extend = _.extend;
const zip = _.zip;
const defaults = _.defaults;
const omit = _.omit;
const each = _.each;
const pluck = _.pluck;
const find = _.find;

// Setup debug log
const debug = require('abacus-debug')('abacus-mongoclient');
const edebug = require('abacus-debug')('e-abacus-mongoclient');
const pdebug = require('abacus-debug')('p-abacus-mongoclient');

// Pad with zeroes up to 16 digits
const pad16 = (t) => {
  const trim = (s) => s[0] === '0' && (s[1] >= '0' && s[1] <= '9') ?
    trim(s.substr(1)) : s;
  const tt = trim(t.toString());
  const n = parseInt(tt).toString();
  const s = '0000000000000000' + n;
  return s.slice(s.length - 16) + tt.toString().substr(n.length);
};

// Convert a key and time to a URI in the form k/:key/t:time
const kturi = (k, t) => {
  return t !== undefined ?
    ['k', k, 't', pad16(t)].join('/') :
    ['k', k].join('/');
};

// Convert a key and time to a URI in the form t/:time/k/:key
const tkuri = (k, t) => {
  return k !== undefined ?
    ['t', pad16(t), 'k', k].join('/') :
    ['t', pad16(t)].join('/');
};

// Return the time in a URI containing a t/:time pattern, the time can have
// multiple segments separated by / as well
const time = (uri) => {
  const tk = /^t\/(.*)\/k\//.exec(uri);
  if(tk) {
    debug('Extracted time %s from %s', tk[1], uri);
    return tk[1];
  }
  const t = /\/t\/(.*)/.exec(uri);
  if(t) {
    debug('Extracted time %s from %s', t[1], uri);
    return t[1];
  }
  debug('No time found in %s', uri);
  return undefined;
};

// Return the key in a URI containing a k/:key pattern, the key can have
// multiple segments separated by / as well
const key = (uri) => {
  const kt = /^k\/(.*)\/t\//.exec(uri);
  if(kt) {
    debug('Extracted key %s from %s', kt[1], uri);
    return kt[1];
  }
  const k = /\/k\/(.*)/.exec(uri);
  if(k) {
    debug('Extracted key %s from %s', k[1], uri);
    return k[1];
  }
  debug('No key found in %s', uri);
  return undefined;
};

// Return a db uri naming function configured with a db uri name prefix
const dburi = (server, name) => {
  if(!server)
    return (p) => [name, p.join('-')].join('-');

  const queryOpts = url.parse(server).search;
  const srv = queryOpts ? server.replace(queryOpts, '') : server;
  const path = /:name/.test(srv) ? request.route(srv, {
    name: name
  }) : [srv, name].join('/');

  return (p) => queryOpts ? [path, p.join('-')].join('-') + queryOpts :
    [path, p.join('-')].join('-');
};

// Construct a db handle for a db uri
const dbcons = (uri, opt, cb) => {
  const url = /:/.test(uri) ? uri : 'mongodb://localhost:27017/' + uri;
  mongoDB.connect(url, defaults(opt || {}, {
    server: {
      poolSize: 1,
      sslValidate: false,
      socketOptions: {
        keepAlive: 1,
        connectTimeoutMS: 30000
      }
    },
    replset: {
      poolSize: 1,
      sslValidate: false,
      socketOptions: {
        keepAlive: 1,
        connectTimeoutMS: 30000
      }
    }
  }), (err, db) => {
    if (err) edebug('Failed to connect to mongodb uri %s with options %o ' +
      'because of %o', url, opt, err);
    else {
      debug('Connected to mongodb uri %s with options %o', url, opt);

      // Warning: mutating variable db, but that's intentional
      db.errorDB = false;
      db.dbconsOptions = opt;
    }
    cb(err, db);
  });
};

// Return a db handle for an erroneous db partition, which will return
// the given error on all db operations
const errdb = (name, err) => ({
  databaseName: name,
  errorDB: true,
  collection: (id) => ({
    find: (id, excluded, opt) => ({
      sort: (fields) => ({
        limit: (id) => ({
          next: (cb) => setImmediate(() => cb(err)),
          toArray: (cb) => setImmediate(() => cb(err))
        })
      }),
      limit: (id) => ({
        next: (cb) => setImmediate(() => cb(err)),
        toArray: (cb) => setImmediate(() => cb(err))
      }),
      toArray: (cb) => setImmediate(() => cb(err))
    }),
    insertOne: (doc, cb) => setImmediate(() => cb(err)),
    insertMany: (doc, opt, cb) => setImmediate(() => cb(err)),
    updateOne: (query, update, opt, cb) => setImmediate(() => cb(err)),
    deleteOne: (doc, cb) => setImmediate(() => cb(err)),
    deleteMany: (docs, opt, cb) => setImmediate(() => cb(err)),
    initializeOrderedBulkOp: () => ({
      insertOne: (doc) => {},
      find: (id) => ({
        upsert: () => ({
          updateOne: (doc) => {}
        })
      }),
      execute: (cb) => setImmediate(() => cb(err))
    })
  })
});

// Return the db handle of the partition to use for a given key and time
const dbpartition = (k, t, rw, part, pool, cb) => {
  part(k, t, rw, (err, p) => err ?
    cb(null, errdb(dburi('err')([k, t ]), err)) : pool(p, rw, cb));
};

// Run a single db operation on a doc, using the given partition and db pool
// functions to select and obtain the proper db partition
const singleOp = (op, rw, doc, part, pool, cb) => {
  const lcb = (err, res) => {
    if(err) edebug('Single db op failed, error %o', err);
    cb(err, res);
  };
  dbpartition(
    key(doc._id), time(doc._id), rw, part, pool,
    (err, db) => err ? lcb(err) : op(db, doc, lcb));
};

// Run a db operation on a batch of docs, using the given partition and db
// pool functions to select and obtain the proper db partitions. The docs
// are first arranged in one individual group per selected db partition, then
// the db operation is applied to each group and the corresponding partition.
// Finally the db operation results are assembled back into a single list of
// results in the order of the given list of docs.
const batchOp = (op, rw, docs, opt, part, pool, cb) => {
  const lcb = (err, res) => {
    if(err) edebug('Batch db op failed, error %o', err);
    cb(err, res);
  };

  // Build a map of requested docs to target dbs
  transform.map(docs, (doc, i, docs, mcb) => {

    // Return each doc with its index in the request list and the mapped db
    dbpartition(key(doc._id), time(doc._id), rw, part, pool,
      (err, db) => err ? mcb(err) : mcb(null, {
        i: i,
        doc: doc,
        db: db
      }));

  }, (err, maps) => {
    if(err) return lcb(err);

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db.databaseName));
    debug('Batch db op split into %d groups', groups.length);

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      debug('Applying db op to batch group with %d docs for db %s',
        gmaps.length, gmaps[0].db.databaseName);

      // Return a zip of the requests and corresponding results lists
      op(gmaps[0].db, map(gmaps, (map) => map.doc), opt, (err, rows) => {
        return mcb(null, zip(gmaps, err ? map(gmaps, (map) => ({
          error: err
        })) : rows));
      });
    }, (err, grows) => {
      if(err) return lcb(err);

      // Assemble the resulting rows into a single list of rows ordered
      // like the requested docs
      debug('Merging %d batch db op results', grows.length);
      const mergedRows = map(sortBy(flatten(grows, true), (row) => row[0].i),
        (row) => row[1]);
      debug('Merged results %o', mergedRows);

      lcb(null, mergedRows);
    });
  });
};

// Run a db operation on a list of docs, using the given partition and db
// pool functions to select and obtain the proper db partitions. The docs
// are first arranged in one individual group per selected db partition, then
// the db operation is applied to each group and the corresponding partition.
// Finally the db operation results are assembled back into a single list of
// results in the order of the given list of docs.
const bulkOp = (op, rw, docs, opt, part, pool, cb) => {
  const lcb = (err, res) => {
    if(err) edebug('Bulk db op failed, error %o', err);
    cb(err, res);
  };

  // Build a map of requested docs to target dbs
  transform.map(docs, (doc, i, docs, mcb) => {

    // Return each doc with its index in the request list and the mapped db
    dbpartition(key(doc._id), time(doc._id), rw, part, pool,
      (err, db) => err ? mcb(err) : mcb(null, {
        i: i,
        doc: doc,
        db: db
      }));

  }, (err, maps) => {
    if(err) return lcb(err);

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db.databaseName));
    debug('Bulk db op split into %d groups', groups.length);

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      debug('Applying db op to bulk group with %d docs for db %s',
        gmaps.length, gmaps[0].db.databaseName);

      // Return a zip of the requests and corresponding results lists
      op(gmaps[0].db, map(gmaps, (map) => map.doc), opt,
        (err, rows) => err ? mcb(err) : mcb(null, zip(gmaps, rows)));
    }, (err, grows) => {
      if(err) return lcb(err);

      // Assemble the resulting rows into a single list of rows ordered
      // like the requested docs
      debug('Merging %d bulk db op results', grows.length);
      lcb(null, map(sortBy(flatten(grows, true), (row) => row[0].i), (
        row) => row[1]));
    });
  });
};

// Return the db handles of the partitions to use for a given key and a time
// range
const dbpartitions = (k, t, rw, part, pool, cb) => {
  part(k, t, rw, (err, pars) => err ? cb(err) : transform.map(pars, (p, i,
    pars, pcb) => pool(p, rw, pcb), cb));
};

// Run a db operation on a range of keys, using the given partition and db
// pool functions to select and obtain the proper db partitions. The db
// operation is run on the partitions in sequence until the requested number
// of rows is returned.
const rangeOp = (op, rw, docs, opt, part, pool, cb) => {
  const lcb = (err, res) => {
    if(err) edebug('Range db op failed, error %o', err);
    cb(err, res);
  };

  // Compute the db partitions to use
  dbpartitions(key(docs[0]._id),
    [time(docs[0]._id), time(docs[1]._id)], rw, part, pool, (err, dbs) => {
      if(err) return lcb(err);

      // Apply the given db operation to each db and accumulate the results
      transform.reduce(dbs, (accum, db, i, dbs, rcb) => {

        // Stop once we've accumulated the requested number of rows
        if(opt.limit && accum.length === opt.limit)
          return rcb(undefined, accum);

        // Apply the db operation, with an adjusted row limit if needed
        op(db, docs, opt.limit ? extend({}, opt, {
          limit: opt.limit - accum.length
        }) : opt,
        (err, rows) => err ? rcb(err) : rcb(undefined, accum.concat(rows)));
      }, [], lcb);
    });
};

// Regularly log db call performance stats
if(pdebug.enabled())
  setInterval(() => {
    pdebug('Gets %o', perf.stats('db.get'));
    pdebug('Puts %o', perf.stats('db.put'));
    pdebug('Removes %o', perf.stats('db.remove'));
    pdebug('allDocs %o', perf.stats('db.allDocs'));
    pdebug('bulkDocs %o', perf.stats('db.bulkDocs'));
  }, 10000);

// Add the required db metadata fields to a doc
const dbify = (doc, ext) => {
  const dbifiedDoc = !doc._id ? extend({}, doc, {
    _id: doc.id
  }) : doc;
  return ext ? extend(dbifiedDoc, ext) : dbifiedDoc;
};

// Remove db metadata fields from a doc
const undbify = (doc) => {
  return doc._id || doc._rev ? omit(doc, '_id', '_rev') : doc;
};

// Post-process db errors and mark them such that they nicely flow through
// circuit breakers and retries
const error = (err) => {
  if(!err)
    return err;

  // Ensure we propagate generic Error and not db specific errors
  let e = err;
  if (err.name && err.name === 'MongoError')
    e = extend(new Error(), omit(err, 'name'));

  if(e.status !== 409 && e.status !== 404)
    return e;

  // Warning: mutating variable err, but that's intentional
  e.noretry = true;
  e.nobreaker = true;
  return e;
};

// Convert a URI to a printable URI, with the optional user and password
// replaced by stars
const puri = (u) => {
  return u.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
};

const getCollectionName = (db) => {
  if (db.errorDB) {
    debug('Using documents collection for error db %s', db.databaseName);
    return 'documents';
  }

  const uri = db.s.options.url;
  const u = url.parse(uri);
  if (!u.pathname) {
    debug('Using documents collection for default db %s', db.databaseName);
    return 'documents';
  }
  const parts = u.pathname.split('/');

  // Return default "documents" collection in case the path is
  // in the form /dbname
  if (parts.length < 3) {
    debug('Using documents collection for uri %s', uri);
    return 'documents';
  }
  // Return the specified collection with path /dbname/collection
  debug('Using %s collection for uri %s', parts[2], uri);
  return parts[2];
};

// Return a db object implementing a subset of the MongoDB API over a set of
// db partitions
const dbclient = (part, uri, cons) => {
  const dbopt = defaults({
    partition: part,
    uri: uri,
    cons: cons
  }, {
    partition: partition,
    uri: dburi(undefined, 'db'),
    cons: dbcons
  });

  // Pool of memoized db partition handles
  // Warning: partitions is a mutable variable, but that's the point of
  // memoization anyway
  const partitions = [];
  const pool = (p, rw, cb) => {
    // Convert db partition to a db name
    const u = dbopt.uri(p);
    debug('Using db %s in %s mode', puri(u), rw);

    // Return memoized db partition handle or get and memoize a new one
    // from the given db constructor. DB handles are keyed by db uri and
    // read/write operating mode
    const dbk = [u, rw].join('-');
    if (partitions[dbk])
      return cb(null, partitions[dbk]);

    debug('Constructing db handle for db %s in %s mode', puri(u), rw);
    return dbopt.cons(u, {}, (err, db) => {
      if(err) return cb(null, errdb('dbcons-err-' + u, err));

      // Warning: mutating variable partitions
      // Memoize the db handle with both the read mode and the
      // requested read/write mode
      partitions[[u, 'read'].join('-')] = db;
      partitions[dbk] = db;

      cb(null, db);
    });
  };

  return {
    fname: 'dbclient',

    // Get a single doc
    get: (id, cb) => {
      debug('Getting doc %s', id);
      const t0 = Date.now();
      singleOp((db, doc, cb) => {
        const collection = db.collection(getCollectionName(db));
        collection.find({ _id: doc._id }).limit(1).next((err, val) => {
          if (!val && !err)
            return cb(null, undefined);
          return cb(error(err), val);
        });
      }, 'read', {
        _id: id
      }, dbopt.partition, pool, (err, val) => {
        perf.report('db.get', t0);
        cb(err, val);
      });
    },

    // Put a single doc
    put: (doc, cb) => {
      debug('Putting doc %o', doc);
      const t0 = Date.now();
      singleOp((db, doc, cb) => {
        const collection = db.collection(getCollectionName(db));
        collection.insertOne(doc, (err, val) => {
          if (err && err.code && err.code === 11000) {
            // Warning: mutating variable err, but that's intentional
            err.status = 409;
            return cb(error(err), undefined);
          }
          cb(error(err), extend(doc, { id: doc._id }));
        });
      }, 'write', dbify(doc), dbopt.partition, pool, (err, val) => {
        perf.report('db.put', t0);
        cb(err, val);
      });
    },

    // Remove a single doc
    remove: (doc, cb) => {
      debug('Removing doc %o', doc);
      const t0 = Date.now();
      singleOp((db, doc, cb) => {
        const collection = db.collection(getCollectionName(db));
        collection.deleteOne({ _id: doc._id },
          (err, val) => cb(error(err), extend(doc, { id: doc._id }))
        );
      }, 'write', dbify(doc, {
        _deleted: true
      }), dbopt.partition, pool, (err, val) => {
        perf.report('db.remove', t0);
        cb(err, val);
      });
    },

    // Get a list of docs
    allDocs: (opt, cb) => {
      debug('Getting a list of docs %o', opt);
      const t0 = Date.now();

      // Search for docs with keys in the given range
      if(opt.startkey && opt.endkey)
        rangeOp((db, docs, opt, cb) => {
          // Get the documents in the given range from each selected
          // db partition
          const collection = db.collection(getCollectionName(db));
          const query = opt.descending === true ?
            { $gte: opt.endkey, $lte: opt.startkey } :
            { $gte: opt.startkey, $lte: opt.endkey };
          collection.find({ _id: query },
            opt.include_docs !== true ? { value: 0 } : {}
          ).sort({
            _id: opt.descending !== true ? 1 : -1
          }).limit(opt.limit || 0).toArray((err, res) => {
            if (err)
              return cb(error(err));
            if (!res) {
              debug('Mapping not_found error to empty rows list');
              return cb(null, []);
            }
            return cb(null, map(res, (result) =>
              extend(opt.include_docs === true ? { doc: result } : {},
                { id: result._id })
            ));
          });
        }, 'read', [{
          _id: opt.startkey
        }, {
          _id: opt.endkey
        }], opt, dbopt.partition, pool,
          (err, rows) => {
            perf.report('db.allDocs', t0);
            return err ? cb(err) : cb(null, { rows: rows });
          });
      else
        // Search for docs with the given keys
        bulkOp((db, docs, opt, cb) => {
          // Get the proper subset of the list of docs from each
          // selected db partition
          const collection = db.collection(getCollectionName(db));
          collection.find({
            _id: { $in: opt.keys }
          }, opt.include_docs !== true ? { value: 0 } : {}
          ).sort({
            _id: opt.descending !== true ? 1 : -1
          }).limit(opt.limit || 0).toArray((err, res) => {
            if (err)
              return cb(error(err));
            if (!res || res.length == 0) {
              debug('Mapping not_found error to row not_found errors');
              return cb(null, map(docs, (doc) => ({
                error: 'not_found'
              })));
            }
            return cb(null, map(res, (result) =>
              extend(opt.include_docs === true ? { doc: result } : {},
                { id: result._id })
            ));
          });
        }, 'read', map(opt.keys, (id) => ({
          _id: id
        })), opt, dbopt.partition, pool,
          (err, rows) => {
            perf.report('db.allDocs', t0);
            return err ? cb(err) : cb(null, { rows: rows });
          });
    },

    // Update a list of docs
    bulkDocs: (docs, opt, cb) => {
      debug('Updating list of docs %o', docs);
      const t0 = Date.now();
      bulkOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        const bulk = collection.initializeOrderedBulkOp();
        each(docs, (doc) => {
          bulk.find({ _id: doc._id }).upsert().updateOne(doc);
        });
        bulk.execute((err, res) => err ? cb(error(err)) :
          cb(null, map(docs, (doc) => extend(doc, { id: doc._id })))
        );
      }, 'write', map(docs, (doc) => dbify(doc)),
      opt, dbopt.partition, pool, (err, val) => {
        perf.report('db.bulkDocs', t0);
        cb(err, val);
      });
    },

    // Batch versions of the above functions, for use with batch.batchify

    // Batch version of get
    batch_get: (batch, cb) => {
      debug('Getting a batch of docs', batch);
      // Convert a batch of gets to a bulk operation
      const t0 = Date.now();
      const opt = {
        include_docs: true
      };
      batchOp((db, docs, opt, cb) => {
        // Get the proper subset of the list of docs from each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        collection.find({
          _id: { $in: pluck(docs, '_id') }
        }, opt.include_docs !== true ? { value: 0 } : {}
        ).limit(opt.limit || 0).toArray((err, res) => {
          if (err)
            return cb(error(err));
          if (!res || res.length === 0) {
            debug('Mapping not_found error to row not_found errors');
            return cb(null, map(docs, (doc) => ({
              error: 'not_found'
            })));
          }
          return cb(null, map(docs, (doc) =>
            ({ doc: find(res, (r) => doc._id === r._id) })
          ));
        });
      }, 'read', map(batch, (args) => ({
        _id: args[0]
      })), opt, dbopt.partition, pool,
        (err, rows) => {
          perf.report('db.batch_get', t0);
          return err ? cb(err) : cb(null, map(rows, (row) => {
            if(!row)
              return [null, undefined];
            if(row.error)
              return row.error === 'not_found' ?
                [null, undefined] : [error(row.error), undefined];
            if(row.doc === null)
              return row.value !== null && row.value.deleted ? [
                null, undefined
              ] : [mongoDB.Errors.UNKNOWN_ERROR, undefined];
            return [null, row.doc];
          }));
        });
    },

    // Batch version of put
    batch_put: (batch, cb) => {
      debug('Putting a batch of docs %o', batch);
      // Convert a batch of puts to a bulk operation
      const t0 = Date.now();
      batchOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        collection.insertMany(docs, opt,
          (err, res) => err ? cb(error(err)) :
            cb(null, map(docs, (doc) => extend(doc, { id: doc._id })))
        );
      }, 'write', map(batch, (args) => dbify(args[0])),
      {}, dbopt.partition, pool,
      (err, rows) => {
        perf.report('db.batch_put', t0);
        return err ? cb(err) : cb(null, map(rows, (row) => {
          if (row.error === true)
            return [error(row), undefined];
          if (row.error) {
            if (row.error.code && row.error.code === 11000)
              // Warning: mutating variable err, but that's intentional
              row.error.status = 409;
            return [error(row.error), undefined];
          }
          return [null, row];
        }));
      });
    },

    // Batch version of remove
    batch_remove: (batch, cb) => {
      debug('Removing a batch of docs %o', batch);
      // Convert a batch of removes to a bulk operation
      const t0 = Date.now();
      batchOp((db, docs, opt, cb) => {
        // Remove the proper subset of the list of docs on each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        collection.deleteMany({
          _id: { $in: pluck(docs, '_id') }
        }, opt, (err, res) => err ? cb(error(err)) :
          cb(null, map(docs, (doc) => extend(doc, { id: doc._id })))
        )
      }, 'write', map(batch, (args) => dbify(args[0], {
        _deleted: true
      })), {}, dbopt.partition, pool,
        (err, rows) => {
          perf.report('db.batch_remove', t0);
          return err ? cb(err) : cb(null, map(rows, (row) => {
            return row.error ? [error(row.error), undefined] : [null, row];
          }));
        });
    }
  };
};

// Export our public functions
module.exports = dbclient;
module.exports.tkuri = tkuri;
module.exports.kturi = kturi;
module.exports.k = key;
module.exports.t = time;
module.exports.dburi = dburi;
module.exports.dbcons = dbcons;
module.exports.dbify = dbify;
module.exports.undbify = undbify;
module.exports.pad16 = pad16;
