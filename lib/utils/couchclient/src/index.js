'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

const partition = require('abacus-partition');
const transform = require('abacus-transform');
const request = require('abacus-request');
const memdown = require('memdown');
const moment = require('abacus-moment');
const perf = require('abacus-perf');
const url = require('url');
const lock = require('abacus-lock');

// Configure needed PouchDB functionality
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

const _ = require('underscore');
const defaults = _.defaults;
const extend = _.extend;
const filter = _.filter;
const findWhere = _.findWhere;
const map = _.map;
const without = _.without;

// Setup debug log
const debug = require('abacus-debug')('abacus-couchclient');
const edebug = require('abacus-debug')('e-abacus-couchclient');
const pdebug = require('abacus-debug')('p-abacus-couchclient');

// Return a db uri naming function configured with a db uri name prefix
const dburi = (server, name) => {
  if(!server)
    return (partition, cb) => cb(null, [name, partition.join('-')].join('-'));

  const path = /:name/.test(server) ? request.route(server, {
    name: name
  }) : [server, name].join('/');

  return (partition, cb) => cb(null, [path, partition.join('-')].join('-'));
};

const inMemoryOpt = { adapter: 'memory' };

const dbOpts = (uri, opt) => {
  const defaultOpts = process.env.DB_OPTS ?
    JSON.parse(process.env.DB_OPTS) : {};
  return /:/.test(uri) ? defaults(opt || {}, defaultOpts) :
    defaults(opt || {}, defaultOpts, inMemoryOpt);
};

// Construct a db handle for a db uri, use the memory adapter to create an
// local in-memory db if the uri is just a local name not containing a :
const dbcons = (uri, opt, cb) => {
  const options = dbOpts(uri, opt);
  const db = new PouchDB(uri, options);
  db.dbconsUrl = uri;
  db.dbconsOptions = options;
  cb(undefined, db);
};

// Return a db handle for an erroneous db partition, which will return
// the given error on all db operations
const errdb = (name, err) => ({
  name: name,
  errorDB: true,
  get: (id, cb) => setImmediate(() => cb(err)),
  put: (doc, cb) => setImmediate(() => cb(err)),
  remove: (doc, cb) => setImmediate(() => cb(err)),
  allDocs: (opt, cb) => setImmediate(() => cb(err)),
  bulkDocs: (docs, opt, cb) => setImmediate(() => cb(err))
});

// Regularly log db call performance stats
if(pdebug.enabled())
  setInterval(() => {
    pdebug('Gets %o', perf.stats('db.get'));
    pdebug('Puts %o', perf.stats('db.put'));
    pdebug('Removes %o', perf.stats('db.remove'));
    pdebug('allDocs %o', perf.stats('db.allDocs'));
    pdebug('bulkDocs %o', perf.stats('db.bulkDocs'));
  }, 10000);

// Post-process db errors and mark them such that they nicely flow through
// circuit breakers and retries
const error = (err) => {
  if(!err)
    return err;
  if (err === 'conflict')
    return {
      status: 409,
      noretry: true,
      nobreaker: true
    };
  if(err.status !== 409 && err.status !== 404)
    return err;
  // Warning: mutating variable err, but that's intentional
  err.noretry = true;
  err.nobreaker = true;
  return err;
};

const isLocalServer = (server) => {
  const u = url.parse(server);
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
};

// List all databases on the specified server
const listDatabases = (server, cb) => {
  debug('Listing databases on %s', server);
  request.get(':server/_all_dbs', {
    server: server
  }, (err, val) => {
    if(err) {
      edebug('Failed to list databases on %s because of %o', server, err);
      return cb(err);
    }

    return cb(null, val.body ? val.body : []);
  });
};

// List all in-memory databases on the specified server
const listInMemoryDatabases = (server, cb) => {
  debug('Listing in-memory databases on %s', server);
  const globalStoreLocations = Object.keys(memdown('_$nonexistent$_')._store);
  const prefix = '$' + (server ? server + '/' : '');
  return map(globalStoreLocations, (key) => key.replace(prefix, ''));
};

// Drop the specified database on the specified server
const dropDatabase = (server, database, options, cb) => {
  debug('Dropping database %s on %s', database, server);
  const dbName = server ? [server, database].join('/') : database;
  const db = new PouchDB(dbName, options);
  db.destroy((err) => {
    if (err) {
      edebug('Failed to drop database %s on %s because of %o',
        database, server, err);
      return cb(err);
    }
    return cb(null);
  });
};

// Drop those databases from the specified list that match the specified regex
const dropListedDatabases = (server, dbs, regex, options, cb) => {
  // Find the dbs that match the specified regex
  const matchingDatabases = without(filter(dbs, (d) => regex.exec(d)),
    '_replicator', '_users');
  return transform.map(matchingDatabases, (database, i, l, cb) => {
    // Drop the database
    dropDatabase(server, database, options, cb);
  }, (err) => {
    if (err)
      return cb(err);

    return cb(null, matchingDatabases);
  });
};

// Drop all server databases that match the specified regex
const dropServerDatabases = (server, regex, options, localOnly, cb) => {
  debug('Deleting databases matching %s on %s', regex, server);

  if (!localOnly || isLocalServer(server))
  // List all databases
    listDatabases(server, (err, dbs) => {
      if (err)
        return cb(err);

      // Drop those databases from the list that match the regex
      return dropListedDatabases(server, dbs, regex, options, cb);
    });
  else {
    debug('Skipping non-local server %s', server);
    cb(null, []);
  }
};

// Drop all in-memory databases that match the specified regex
const dropInMemoryDatabases = (server, regex, options, cb) => {
  debug('Deleting in-memory databases matching %s on %s', regex, server);

  // List all in-memory databases
  const dbs = listInMemoryDatabases(server);

  // Drop those databases from the list that match the regex
  dropListedDatabases(server, dbs, regex, options, cb);
};

// Drop all databases that match the specified regex
const dropDatabases = (server, regex, localOnly, cb) => {
  const lcb = (err, deletedDatabases) => {
    if (err)
      return cb(err);

    if(deletedDatabases.length > 0)
      debug('Deleted databases: %o', deletedDatabases);
    else
      debug('No databases were deleted');
    return cb(null, deletedDatabases);
  };

  if(/:/.test(server))
    dropServerDatabases(server, regex, {}, localOnly, lcb);
  else
    dropInMemoryDatabases(server, regex, inMemoryOpt, lcb);
};

// Delete all partitions that match the specified regex
// WARNING: This function deletes partitions (that is, databases)
// also on remote servers. Use with caution!
const deletePartitions = (server, regex, cb) => {
  dropDatabases(server, regex, false, cb);
};

// Drop all databases that match the specified regex
// This function deletes databases only on local servers
const drop = (server, regex, cb) => {
  dropDatabases(server, regex, true, cb);
};

// Return a db object implementing a subset of the PouchDB API over a set of
// db partitions
const couchclient = (partitionFn, uriFn, connectionFn, errorDBFn) => {
  const dbopt = defaults({
    partition: partitionFn,
    uri: uriFn,
    cons: connectionFn,
    errdb: errorDBFn
  }, {
    partition: partition,
    uri: dburi(undefined, 'db'),
    cons: dbcons,
    errdb: errdb,
    omit_id: true
  });

  const dbops = require('abacus-dbcommons')(dbopt);

  // Pool of memoized db partition handles
  let partitions = {};

  // Get pooled db partition handle(s)
  const pool = (p, rw, cb) => {

    // Get a pooled db partition handle for a single partition
    const pooldb = (p, rw, cb) => {
      debug('Getting db uri for partition %o', p);
      dbopt.uri(p, (err, u) => {
        if (err)
          return cb(err);
        debug('Using db %s in %s mode', dbops.puri(u), rw);

        // Return a memoized db partition handle or get and memoize a new one
        // from the given db constructor. DB handles are keyed by db uri and
        // read/write operating mode
        const dbkey = [u, rw].join('-');
        return lock(dbkey, (err, unlock) => {
          if (partitions[dbkey])
            return unlock(cb(null, partitions[dbkey]));

          const options = {
            // Skip db setup in read mode, as we don't need the db to be
            // created if it doesn't exist
            skip_setup: rw === 'read'
          };
          debug('Constructing db handle for db %s in %s mode',
            dbops.puri(u), rw);
          return dbopt.cons(u, options, (err, db) => {
            if (err)
              return unlock(cb(null, dbopt.errdb('dbcons-err-' + u, err)));

            // Do not pool in-memory DBs
            if (findWhere([db.dbconsOptions], inMemoryOpt)) {
              debug('In-memory db handle for db %s not pooled', dbops.puri(u));
              return unlock(cb(null, db));
            }

            // Memoize the db handle with both the read mode and the
            // requested read/write mode
            partitions[[u, 'read'].join('-')] = db;
            partitions[dbkey] = db;

            return unlock(cb(null, db));
          });
        });
      });
    };

    if(Array.isArray(p[0]))
      transform.map(p, (v, i, p, mcb) => pooldb(v, rw, mcb), cb);
    else
      pooldb(p, rw, cb);
  };

  return {
    fname: 'couchclient',

    // Get a single doc
    get: (id, cb) => {
      debug('Getting doc %s', id);
      const t0 = moment.now();
      dbops.singleOp((db, doc, cb) => {
        db.get(doc._id, (err, val) =>
          err && err.name === 'not_found' ?
            cb(null, undefined) : cb(error(err), val));
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
      const t0 = moment.now();
      dbops.singleOp((db, doc, cb) => {
        db.put(doc, (err, val) => cb(error(err), val));
      }, 'write', dbops.dbify(doc), dbopt.partition, pool, (err, val) => {
        perf.report('db.put', t0);
        cb(err, val);
      });
    },

    // Remove a single doc
    remove: (doc, cb) => {
      debug('Removing doc %o', doc);
      const t0 = moment.now();
      dbops.singleOp((db, doc, cb) => {
        db.remove(doc, (err, val) => cb(error(err), val));
      }, 'write', dbops.dbify(doc), dbopt.partition, pool, (err, val) => {
        perf.report('db.remove', t0);
        cb(err, val);
      });
    },

    // Get a list of docs
    allDocs: (opt, cb) => {
      debug('Getting a list of docs %o', opt);
      const t0 = moment.now();
      if(opt.startkey && opt.endkey)
        // Search for docs with keys in the given range
        dbops.rangeOp((db, docs, opt, cb) => {
          // Get the documents in the given range from each selected
          // db partition
          db.allDocs(opt, (err, res) => {
            debug('Options %o', opt);
            if(err) {
              if(err.error && err.name === 'not_found') {
                debug('Mapping not_found error to empty rows list');
                return cb(null, []);
              }
              return cb(error(err));
            }
            return cb(null, res.rows);
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
        dbops.bulkOp((db, docs, opt, cb) => {
          // Get the proper subset of the list of docs from each
          // selected db partition
          db.allDocs(extend({}, opt, {
            keys: map(docs, (doc) => doc._id)
          }), (err, res) => {
            if(err) {
              if(err.error && err.name === 'not_found') {
                debug('Mapping not_found error to row not_found errors');
                return cb(null, map(docs, (doc) => ({
                  error: 'not_found'
                })));
              }
              return cb(error(err));
            }
            return cb(null, res.rows);

          });

        }, 'read', map(opt.keys, (id) => ({
          _id: id
        })), opt, dbopt.partition, pool,
          (err, rows) => {
            perf.report('db.allDocs', t0);
            return err ? cb(err) : cb(null, { rows: rows });
          });
    },

    distinctValues: () => {
      throw Error('Not Implemented');
    },

    // Update a list of docs
    bulkDocs: (docs, opt, cb) => {
      debug('Updating list of docs %o', docs);
      const t0 = moment.now();
      dbops.bulkOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        db.bulkDocs(docs, opt,
          (err, res) => err ? cb(error(err)) : cb(null, res));

      }, 'write', map(docs, (doc) => dbops.dbify(doc)),
      opt, dbopt.partition, pool, (err, rows) => {
        perf.report('db.bulkDocs', t0);
        return err ? cb(err) : cb(null, map(rows,
          (row) => row.error ? error(row) : row));
      });
    },

    // Batch versions of the above functions, for use with batch.batchify

    // Batch version of get
    batch_get: (batch, cb) => {
      debug('Getting a batch of docs', batch);
      // Convert a batch of gets to a bulk operation
      const t0 = moment.now();
      const opt = {
        include_docs: true
      };
      dbops.batchOp((db, docs, opt, cb) => {
        // Get the proper subset of the list of docs from each
        // selected db partition
        db.allDocs(extend({}, opt, {
          keys: map(docs, (doc) => doc._id)
        }), (err, res) => {
          if(err) {
            if(err.error && err.name === 'not_found') {
              debug('Mapping not_found error to row not_found errors');
              return cb(null, map(docs, (doc) => ({
                error: 'not_found'
              })));
            }
            return cb(error(err));
          }
          return cb(null, res.rows);

        });
      }, 'read', map(batch, (args) => ({
        _id: args[0]
      })), opt, dbopt.partition, pool,
        (err, rows) => {
          perf.report('db.allDocs', t0);
          return err ? cb(err) : cb(null, map(rows, (row) => {
            if(row.error)
              return row.error === 'not_found' ?
                [null, undefined] : [error(row.error), undefined];
            if(row.doc === null)
              return row.value !== null && row.value.deleted ? [
                null, undefined
              ] : [PouchDB.Errors.UNKNOWN_ERROR, undefined];
            return [null, row.doc];
          }));
        });
    },

    // Batch version of put
    batch_put: (batch, cb) => {
      debug('Putting a batch of docs %o', batch);
      // Convert a batch of puts to a bulk operation
      const t0 = moment.now();
      dbops.batchOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        db.bulkDocs(docs, opt,
          (err, res) => err ? cb(error(err)) : cb(null, res));

      }, 'write', map(batch, (args) => dbops.dbify(args[0])),
      {}, dbopt.partition, pool,
        (err, rows) => {
          perf.report('db.bulkDocs', t0);
          return err ? cb(err) : cb(null, map(rows, (row) => {
            return row.error === true ? [error(row), undefined] :
              row.error ? [error(row.error), undefined] : [null, row];
          }));
        });
    },

    // Batch version of remove
    batch_remove: (batch, cb) => {
      debug('Removing a batch of docs %o', batch);
      // Convert a batch of removes to a bulk operation
      const t0 = moment.now();
      dbops.batchOp((db, docs, opt, cb) => {
        // Remove the proper subset of the list of docs on each
        // selected db partition
        db.bulkDocs(docs, opt,
          (err, res) => err ? cb(error(err)) : cb(null, res));

      }, 'write', map(batch, (args) => dbops.dbify(args[0], {
        _deleted: true
      })), {}, dbopt.partition, pool,
        (err, rows) => {
          perf.report('db.bulkDocs', t0);
          return err ? cb(err) : cb(null, map(rows, (row) => {
            return row.error ? [error(row.error), undefined] : [null, row];
          }));
        });
    },

    // runs query for singleton partitions
    query: (queryid, opt, cb) => {
      debug('Query is %s', queryid);
      const t0 = moment.now();
      dbops.singleOp((db, doc, cb) => {
        db.query(doc._id, doc.opt, (err, val) =>
          err && err.name === 'not_found' ?
            cb(null, undefined) : cb(error(err), val));
      }, 'read', {
        _id: queryid,
        opt: opt
      }, dbopt.partition, pool, (err, val) => {
        perf.report('db.query', t0);
        cb(err, val);
      });
    },

    readAllPages: (opts, processingFn, cb) =>
      dbops.readAllPages(this, opt, processingFn, cb)
  };
};

// Export our public functions
module.exports = couchclient;
module.exports.dbcons = dbcons;
module.exports.dburi = dburi;
module.exports.deletePartitions = deletePartitions;
module.exports.drop = drop;
module.exports.errdb = errdb;
