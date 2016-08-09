'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

const _ = require('underscore');
const partition = require('abacus-partition');
const transform = require('abacus-transform');
const request = require('abacus-request');
const perf = require('abacus-perf');
const PouchDB = require('pouchdb');
const memdown = require('memdown');
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
const first = _.first;
const rest = _.rest;
const without = _.without;
const filter = _.filter;

// Setup debug log
const debug = require('abacus-debug')('abacus-couchclient');
const edebug = require('abacus-debug')('e-abacus-couchclient');
const pdebug = require('abacus-debug')('p-abacus-couchclient');

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
  // Indeed a greedy search
  const tg = /t\/(.*)/.exec(uri);
  if(tg) {
    debug('Extracted time %s from %s', tg[1], uri);
    return tg[1];
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
  // Indeed a greedy search
  const kg = /k\/(.*)/.exec(uri);
  if(kg) {
    debug('Extracted key %s from %s', kg[1], uri);
    return kg[1];
  }
  debug('No key found in %s', uri);
  return undefined;
};

// Return a db uri naming function configured with a db uri name prefix
const dburi = (server, name) => {
  if(!server)
    return (p) => [name, p.join('-')].join('-');

  const path = /:name/.test(server) ? request.route(server, {
    name: name
  }) : [server, name].join('/');

  return (p) => [path, p.join('-')].join('-');
};

// Construct a db handle for a db uri, use the memdown adapter to create an
// local in-memory db if the uri is just a local name not containing a :
const dbcons = (uri, opt, cb) => cb(undefined,
  /:/.test(uri) ? new PouchDB(uri, defaults(opt || {}, {
    ajax: {
      rejectUnauthorized: false
    }
  })) : new PouchDB(uri, defaults(opt || {}, {
    db: memdown
  })));

// Return a db handle for an erroneous db partition, which will return
// the given error on all db operations
const errdb = (name, err) => ({
  _db_name: name,
  get: (id, cb) => setImmediate(() => cb(err)),
  put: (doc, cb) => setImmediate(() => cb(err)),
  remove: (doc, cb) => setImmediate(() => cb(err)),
  allDocs: (opt, cb) => setImmediate(() => cb(err)),
  bulkDocs: (docs, opt, cb) => setImmediate(() => cb(err))
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
    if(err) {
      lcb(err);
      return;
    }

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db._db_name));

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      // Return a zip of the requests and corresponding results lists
      op(gmaps[0].db, map(gmaps, (map) => map.doc), opt, (err, rows) => {
        return mcb(null, zip(gmaps, err ? map(gmaps, (map) => ({
          error: err
        })) : rows));
      });

    }, (err, grows) => {
      if(err) {
        lcb(err);
        return;
      }

      // Assemble the resulting rows into a single list of rows ordered
      // like the requested docs
      lcb(null, map(sortBy(flatten(grows, true), (row) => row[0].i), (
        row) => row[1]));
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
    if(err) {
      lcb(err);
      return;
    }

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db._db_name));

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      // Return a zip of the requests and corresponding results lists
      op(gmaps[0].db, map(gmaps, (map) => map.doc), opt,
        (err, rows) => err ? mcb(err) : mcb(null, zip(gmaps, rows)));

    }, (err, grows) => {
      if(err) {
        lcb(err);
        return;
      }

      // Assemble the resulting rows into a single list of rows ordered
      // like the requested docs
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

  const skip = opt.skip ? opt.skip : 0;

  const lcb = (err, res) => {
    if(err) {
      edebug('Range db op failed, error %o', err);
      cb(err, res);
      return;
    }
    cb(undefined, rest(res, skip));
  };

  const k = key(docs[0]._id) ? key(docs[0]._id) === key(docs[1]._id) ?
    key(docs[0]._id) : undefined : undefined;

  debug('Using key %s for range operation %o', k, opt);
  // Compute the db partitions to use
  dbpartitions(k,
    [time(docs[0]._id), time(docs[1]._id)], rw, part, pool, (err, dbs) => {
      if(err) {
        lcb(err);
        return;
      }
      // Apply the given db operation to each db and accumulate the results
      transform.reduce(dbs, (accum, db, i, dbs, rcb) => {
        // Stop once we've accumulated the requested number of rows
        if(opt.limit && accum.length === opt.limit) {
          rcb(undefined, accum);
          return;
        }
        // If db is an array, search in all dbs.
        if(Array.isArray(db))
          transform.map(db, (v, i, l, mcb) => {
            debug('Running operation in db %s', v._db_name);
            op(v, docs, opt.limit ? extend({}, opt, {
              limit: opt.limit - accum.length + skip,
              skip: 0
            }) : extend({}, opt, { skip: 0 }),
            (err, rows) => err ? mcb(err) : mcb(undefined, rows));
          }, (err, rows) => {
            if(err) {
              rcb(err);
              return;
            }
            // Flatten the rows from dbs and sort them.
            const sr = opt.descending ? sortBy(flatten(rows, true),
            (r) => r.id).reverse() : sortBy(flatten(rows, true), (r) => r.id);
            debug(sr);
            rcb(undefined, opt.limit ? accum.concat(first(sr, opt.limit
              - accum.length + skip)) : accum.concat(sr));
          });
        else
          op(db, docs, opt.limit ? extend({}, opt, {
            limit: opt.limit - accum.length + skip
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
  const dbifiedDoc = !doc._id ? extend(omit(doc, 'id'), {
    _id: doc.id
  }) : doc;
  return ext ? extend(dbifiedDoc, ext) : dbifiedDoc;
};

// Remove db metadata fields from a doc
const undbify = (doc) => {
  return doc._id || doc._rev ? extend(omit(doc, '_id', '_rev'), {
    id: doc._id
  }) : doc;
};

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

// Convert a URI to a printable URI, with the optional user and password
// replaced by stars
const puri = (u) => {
  return u.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
};

// Return a db object implementing a subset of the PouchDB API over a set of
// db partitions
const couchclient = (part, uri, cons) => {
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
    if(Array.isArray(p[0]))
      return transform.map(p, (v, i, p, mcb) => {
        const u = dbopt.uri(v);
        debug('Using db %s in %s mode', puri(u), rw);

        // Return memoized db partition handle or get and memoize a new one
        // from the given db constructor. DB handles are keyed by db uri and
        // read/write operating mode
        const dbk = [u, rw].join('-');
        if (partitions[dbk])
          return mcb(null, partitions[dbk]);

        debug('Constructing db handle for db %s in %s mode', puri(u), rw);
        return dbopt.cons(u, {
          // Skip db setup in read mode, as we don't need the db to be
          // created if it doesn't exist
          skip_setup: rw === 'read'
        }, (err, db) => {
          if(err) {
            mcb(null, errdb('dbcons-err-' + u, err));
            return;
          }

          // Warning: mutating variable partitions
          // Memoize the db handle with both the read mode and the
          // requested read/write mode
          partitions[[u, 'read'].join('-')] = db;
          partitions[dbk] = db;

          mcb(null, db);
        });
      }, (err, res) => {
        cb(err, res);
      });
    const u = dbopt.uri(p);
    debug('Using db %s in %s mode', puri(u), rw);

    // Return memoized db partition handle or get and memoize a new one
    // from the given db constructor. DB handles are keyed by db uri and
    // read/write operating mode
    const dbk = [u, rw].join('-');
    if (partitions[dbk])
      return cb(null, partitions[dbk]);

    debug('Constructing db handle for db %s in %s mode', puri(u), rw);
    return dbopt.cons(u, {
      // Skip db setup in read mode, as we don't need the db to be
      // created if it doesn't exist
      skip_setup: rw === 'read'
    }, (err, db) => {
      if(err) {
        cb(null, errdb('dbcons-err-' + u, err));
        return;
      }

      // Warning: mutating variable partitions
      // Memoize the db handle with both the read mode and the
      // requested read/write mode
      partitions[[u, 'read'].join('-')] = db;
      partitions[dbk] = db;

      cb(null, db);
    });
  };

  return {
    fname: 'couchclient',

    // Get a single doc
    get: (id, cb) => {
      debug('Getting doc %s', id);
      const t0 = Date.now();
      singleOp((db, doc, cb) => {
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
      const t0 = Date.now();
      singleOp((db, doc, cb) => {
        db.put(doc, (err, val) => cb(error(err), val));
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
        db.remove(doc, (err, val) => cb(error(err), val));
      }, 'write', dbify(doc), dbopt.partition, pool, (err, val) => {
        perf.report('db.remove', t0);
        cb(err, val);
      });
    },

    // Get a list of docs
    allDocs: (opt, cb) => {
      debug('Getting a list of docs %o', opt);
      const t0 = Date.now();
      if(opt.startkey && opt.endkey)
        // Search for docs with keys in the given range
        rangeOp((db, docs, opt, cb) => {
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
        bulkOp((db, docs, opt, cb) => {
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

    // Update a list of docs
    bulkDocs: (docs, opt, cb) => {
      debug('Updating list of docs %o', docs);
      const t0 = Date.now();
      bulkOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        db.bulkDocs(docs, opt,
          (err, res) => err ? cb(error(err)) : cb(null, res));

      }, 'write', map(docs, (doc) => dbify(doc)),
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
      const t0 = Date.now();
      const opt = {
        include_docs: true
      };
      batchOp((db, docs, opt, cb) => {
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
      const t0 = Date.now();
      batchOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        db.bulkDocs(docs, opt,
          (err, res) => err ? cb(error(err)) : cb(null, res));

      }, 'write', map(batch, (args) => dbify(args[0])),
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
      const t0 = Date.now();
      batchOp((db, docs, opt, cb) => {
        // Remove the proper subset of the list of docs on each
        // selected db partition
        db.bulkDocs(docs, opt,
          (err, res) => err ? cb(error(err)) : cb(null, res));

      }, 'write', map(batch, (args) => dbify(args[0], {
        _deleted: true
      })), {}, dbopt.partition, pool,
        (err, rows) => {
          perf.report('db.bulkDocs', t0);
          return err ? cb(err) : cb(null, map(rows, (row) => {
            return row.error ? [error(row.error), undefined] : [null, row];
          }));
        });
    }
  };
};

// Drop databases that match the given regex.
const drop = (server, regex, cb) => {
  if(/:/.test(server)) {
    // Only do this on localhost or 127.0.0.1 for now as that's only for
    // running our tests
    const u = url.parse(server);
    if(u.hostname !== 'localhost' && u.hostname != '127.0.0.1') {
      debug('Server not on localhost, not deleting all dbs on %s', server);
      cb();
      return;
    }

    // List all remote dbs
    debug('Getting list of all dbs matching %s on %s', regex, server);
    request.get(':server/_all_dbs', {
      server: server
    }, (err, val) => {
      if(err) {
        cb(err);
        return;
      }
      if(!val.body) {
        cb();
        return;
      }

      // Find the dbs that match the given regex
      const names = filter(val.body, (name) => regex.exec(name));
      transform.map(
        without(names, '_replicator', '_users'), (name, i, l, cb) => {
          // Delete each db
          debug('Deleting db %s', name);
          const db = new PouchDB([server, name].join('/'), {});
          db.destroy(cb);
        }, (err) => {
          cb(err);
        });
    });
  }
  else {
    // For in memory dbs we can delete them all, as they only exist
    // in the memory of the caller
    memdown.clearGlobalStore();
    cb();
  }
};

// Export our public functions
module.exports = couchclient;
module.exports.tkuri = tkuri;
module.exports.kturi = kturi;
module.exports.k = key;
module.exports.t = time;
module.exports.dburi = dburi;
module.exports.dbcons = dbcons;
module.exports.dbify = dbify;
module.exports.undbify = undbify;
module.exports.pad16 = pad16;
module.exports.drop = drop;

