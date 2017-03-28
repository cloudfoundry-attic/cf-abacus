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
const moment = require('abacus-moment');
const lock = require('abacus-lock');

const contains = _.contains;
const defaults = _.defaults;
const each = _.each;
const extend = _.extend;
const filter = _.filter;
const find = _.find;
const first = _.first;
const flatten = _.flatten;
const groupBy = _.groupBy;
const map = _.map;
const omit = _.omit;
const pluck = _.pluck;
const rest = _.rest;
const sortBy = _.sortBy;
const values = _.values;
const zip = _.zip;

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

// Get server partitioning mode, either 'collection' or 'db' depending on
// whether the server uri contains a database or not
const getPartitioningMode = (server) => {
  // Remove uri schema and trailing '/'
  const removeSchema = () => {
    const i = server.indexOf('://');
    const schema = i !== -1 ? server.substring(0, i) : undefined;
    const uri = schema ? server.substring(schema.length + 3) : server;
    return uri[uri.length - 1] === '/' ? uri.substring(0, uri.length - 1) : uri;
  };

  // Return 'collection' if the resulting uri still contains '/', otherwise 'db'
  return removeSchema().includes('/') ? 'collection' : 'db';
};

// List all databases on the specified server
const listDatabases = (server, db, cb) => {
  debug('Listing databases on %s', server);
  db.admin().listDatabases((err, dbs) => {
    if (err) {
      edebug('Failed to list databases on %s because of %o', server, err);
      return cb(err);
    }

    // Return all database names
    return cb(null, map(dbs.databases, (d) => d.name));
  });
};

// List all collections on the specified server
const listCollections = (server, db, cb) => {
  debug('Listing collections on %s', server);
  db.listCollections().toArray((err, collections) => {
    if (err) {
      edebug('Failed to list collections on %s because of %o', server, err);
      return cb(err);
    }

    // Return all collection names
    return cb(null, map(collections, (c) => c.name));
  });
};

// List all partitions on the specified server
// Depending on the partition mode, return either all databases
// or all collections in a database
const listPartitions = (server, db, mode, cb) => {
  if (mode === 'db')
    listDatabases(server, db, cb);
  else
    listCollections(server, db, cb);
};

// Drop the specified database on the specified server
const dropDatabase = (server, db, database, cb) => {
  debug('Dropping database %s on %s', database, server);
  db.db(database).dropDatabase((err) => {
    if (err) {
      edebug('Failed to drop database %s on %s because of %o',
        database, server, err);
      return cb(err);
    }

    return cb(null);
  });
};

// Drop the specified collection on the specified server
const dropCollection = (server, db, collection, cb) => {
  debug('Dropping collection %s on %s', collection, server);
  db.collection(collection).drop((err) => {
    if (err) {
      edebug('Failed to drop collection %s on %s because of %o',
        collection, server, err);
      return cb(err);
    }

    return cb(null);
  });
};

// Drop the specified partition on the specified server
// Depending on the partition mode, drops either a database or a collection
const dropPartition = (server, db, partition, mode, cb) => {
  if (mode === 'db')
    dropDatabase(server, db, partition, cb);
  else
    dropCollection(server, db, partition, cb);
};

// Find a server that already contains the specified partition
const findServer = (servers, partition, cb) => {
  debug('Looking for partition %s on all servers', partition);

  // Filter all servers that already contain the specified partition
  const options = dbOpts();
  transform.filter(servers, (server, i, servers, cb) => {
    // Connect to the server
    debug('Connecting to %s with options %o', server, options);
    mongoDB.connect(server, options, (err, db) => {
      if (err) {
        edebug('Failed to connect to %s because of %o', server, err);
        return cb(err);
      }

      // List all partitions on the server
      const mode = getPartitioningMode(server);
      return listPartitions(server, db, mode, (err, partitions) => {
        if (err) {
          db.close();
          return cb(err);
        }

        // Return true if the list of partitions contains the partition
        db.close();
        return cb(null, contains(partitions, partition));
      });
    });
  }, (err, servers) => {
    if (err)
      return cb(err);

    // Return the first server or undefined if no servers were found
    const server = servers.length > 0 ? servers[0] : undefined;
    if(server)
      debug('Partition %s found on server %s', partition, server);
    else
      debug('Partition %s not found on any server', partition);
    return cb(null, server);
  });
};

// Memoized partition servers
const partitionServers = {};

// Get a server for the specified partition
// If it already exists on any of the servers, that server is returned
// Otherwise, a server is assigned based on the partition index
const getServer = (partition, servers, p, cb) => {
  // If a single server, return it
  if (servers.length === 1)
    return cb(null, servers[0]);

  return lock(partition, (err, unlock) => {
    // Return a memoized partition server
    if (partitionServers[partition])
      return unlock(cb(null, partitionServers[partition]));

    // Find a server that already contains the partition
    return findServer(servers, partition, (err, found) => {
      if (err)
        return unlock(cb(err));

      // Use the found server, or assign one if not found
      const server = found ? found : servers[p[0] % servers.length];
      partitionServers[partition] = server;
      return unlock(cb(null, server));
    });
  });
};

// Return a db uri naming function configured with a db uri name prefix
const dburi = (server, name) => {
  if (!server)
    return (p, cb) => cb(null, [name, p.join('-')].join('-'));

  // Compose a db uri from a server uri, name, and partition infos
  const cdburi = (server, p, cb) => {
    const queryOpts = url.parse(server).search;
    const srv = queryOpts ? server.replace(queryOpts, '') : server;
    const path = /:name/.test(srv) ? request.route(srv, {
      name: name
    }) : [srv, name].join('/');

    cb(null, queryOpts ? [path, p.join('-')].join('-') + queryOpts : 
       [path, p.join('-')].join('-'));
  };

  // If there are multiple servers, first get a server for the partition
  // and then compose the db uri from that server
  if(Array.isArray(server))
    return (p, cb) => {
      const partition = [name, p.join('-')].join('-');
      debug('Getting server for partition %s', partition);
      getServer(partition, server, p, (err, server) => {
        if (err)
          return cb(err);
        return cdburi(server, p, cb);
      });
    };
  
  return (p, cb) => cdburi(server, p, cb);
};

// Convert a URI to a printable URI, with the optional user and password
// replaced by stars
const puri = (u) => {
  return u.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
};

const removeCollectionFromUrl = (u) => {
  const schemaSeparator = '://';
  const schemaIndex = u.indexOf(schemaSeparator);
  const schema = schemaIndex != -1 ? u.substring(0, schemaIndex) : undefined;
  const uri = schema ? u.substring(schema.length + 3) : u;

  const parts = uri.split('/');
  if (parts.length < 3)
    return u;

  const path = [parts[0], parts[1]].join('/');
  const queryOpts = url.parse(parts[2]).search;
  const result = [schema ? [schema, schemaSeparator].join('') : '',
    path, queryOpts].join('');
  debug('Removing collection from db url %s. Result: %s', u, result);
  return result;
};

const dbOpts = (opt) => {
  const defaultOpts = process.env.DB_OPTS ?
    JSON.parse(process.env.DB_OPTS) : {};
  return defaults(opt || {}, defaultOpts, {
    poolSize: 1
  });
};

// Construct a db handle for a db uri
const dbcons = (uri, opt, cb) => {
  debug('Constructing db handle for uri %s', uri);
  const url = /:/.test(uri) ? uri : 'mongodb://localhost:27017/' + uri;
  const driverUrl = removeCollectionFromUrl(url);

  const options = dbOpts(opt);
  debug('Connecting to DB on %s with options %o', puri(driverUrl), options);
  mongoDB.connect(driverUrl, options, (err, db) => {
    if (err) edebug('Failed to connect to mongodb uri %s because of %o',
      puri(url), err);
    else {
      debug('Connected to mongodb uri %s', puri(url));

      // Warning: mutating variable db, but that's intentional
      db.errorDB = false;
      db.dbconsUrl = url;
      db.dbconsOptions = options;
    }
    cb(err, db);
  });
};

// Return a db handle for an erroneous db partition, which will return
// the given error on all db operations
const errdb = (name, err) => ({
  dbconsUrl: name,
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
      insert: (doc) => {},
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
    dburi('err')([k, t], (e, u) => cb(null, errdb(u, err))) : pool(p, rw, cb));
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

  debug('Batch db op requested for %d docs', docs.length);

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

    debug('Batch db op starting for ',
      map(maps, (map) => puri(map.db.dbconsUrl)));

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db.dbconsUrl));
    debug('Batch db op split into %d groups', groups.length);

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      debug('Applying db op to batch group with %d docs for db %s',
        gmaps.length, puri(gmaps[0].db.dbconsUrl));

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

  debug('Bulk db op requested for %d docs', docs.length);

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

    debug('Bulk db op starting for URLs %j',
      maps.length > 0 ? map(maps, (map) => puri(map.db.dbconsUrl)) : 'unknown');

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db.dbconsUrl));
    debug('Bulk db op split into %d groups', groups.length);

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      debug('Applying db op to bulk group with %d docs for db %s',
        gmaps.length, puri(gmaps[0].db.dbconsUrl));

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
      debug('Merging %d bulk db op results', grows.length);
      const mergedRows = map(sortBy(flatten(grows, true), (row) => row[0].i),
        (row) => row[1]);
      debug('Merged results %o', mergedRows);

      lcb(null, mergedRows);
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
            debug('Running operation in db %s', v.dbconsUrl);
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

const getCollectionName = (db) => {
  const defaultCollection = 'documents';

  if (db.errorDB) {
    debug('Using documents collection for error db %s', db.databaseName);
    return defaultCollection;
  }

  const u = db.dbconsUrl;
  let collection = defaultCollection;

  const schemaSeparator = '://';
  const schemaIndex = u.indexOf(schemaSeparator);
  const schema = schemaIndex != -1 ? u.substring(0, schemaIndex) : undefined;
  const uri = schema ? u.substring(schema.length + 3) : u;

  const parts = uri.split('/');
  if (parts.length >= 3) {
    const queryOpts = url.parse(parts[2]).search;
    const queryOptsIndex = parts[2].indexOf(queryOpts);
    collection = queryOpts ? parts[2].substring(0, queryOptsIndex) : parts[2];
  }

  debug('Using collection %s for URI %s', collection, uri);
  return collection;
};

// Return a db object implementing a subset of the MongoDB API over a set of
// db partitions
const mongoclient = (part, uri, cons) => {
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
  let partitions = {};

  // Get pooled db partition handle(s)
  const pool = (p, rw, cb) => {

    // Get a pooled db partition handle for a single partition
    const pooldb = (p, cb) => {
      debug('Getting db uri for partition %o', p);
      dbopt.uri(p, (err, u) => {
        if(err)
          return cb(err);
        debug('Using db %s', puri(u));

        // Return a memoized db partition handle or get and memoize a new one
        // from the given db constructor
        return lock(u, (err, unlock) => {
          if (partitions[u])
            return unlock(cb(null, partitions[u]));

          debug('Constructing db handle for db %s', puri(u));
          return dbopt.cons(u, {}, (err, db) => {
            if (err)
              return unlock(cb(null, errdb('dbcons-err-' + u, err)));

            // Memoize the db handle
            partitions[u] = db;

            return unlock(cb(null, db));
          });
        });
      });
    };
  
    if(Array.isArray(p[0]))
      transform.map(p, (v, i, p, mcb) => pooldb(v, mcb), cb);
    else
      pooldb(p, cb);
  };

  return {
    fname: 'mongoclient',

    // Get a single doc
    get: (id, cb) => {
      debug('Getting doc %s', id);
      const t0 = moment.now();
      singleOp((db, doc, cb) => {
        const collection = db.collection(getCollectionName(db));
        collection.find({ _id: doc._id }).limit(1).next((err, val) => {
          if (!val && !err) {
            cb(null, undefined);
            return;
          }
          cb(error(err), val ? extend({ _rev : '1' }, val) : val);
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
      const t0 = moment.now();
      singleOp((db, doc, cb) => {
        const collection = db.collection(getCollectionName(db));
        if(doc._rev)
          // updateOne requires MongoDB 3.2
          collection.update({ _id: doc._id }, doc,
            { upsert: true }, (err, val) => {
              if (err && err.code && err.code === 11000) {
                // Warning: mutating variable err, but that's intentional
                err.status = 409;
                cb(error(err), undefined);
                return;
              }
              cb(error(err), {
                ok: val.writeConcernError ? false : true,
                id: val.writeConcernError ? undefined : doc._id,
                rev: val.writeConcernError ? undefined : doc._rev
              });
            });
        else
          collection.insertOne(defaults(doc, { _rev: '1' }), (err, val) => {
            if (err && err.code && err.code === 11000) {
              // Warning: mutating variable err, but that's intentional
              err.status = 409;
              cb(error(err), undefined);
              return;
            }
            cb(error(err), {
              ok: true,
              id: val ? val.insertedId : undefined,
              rev: val ? '1' : undefined
            });
          });
      }, 'write', dbify(doc), dbopt.partition, pool, (err, val) => {
        perf.report('db.put', t0);
        cb(err, val);
      });
    },

    // Remove a single doc
    remove: (doc, cb) => {
      debug('Removing doc %o', doc);
      const t0 = moment.now();
      singleOp((db, doc, cb) => {
        const collection = db.collection(getCollectionName(db));
        collection.deleteOne({ _id: doc._id },
          (err, val) => cb(error(err), { ok: true, id: doc._id, rev: doc._rev })
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
      const t0 = moment.now();

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
                { id: result._id, key: result._id },
                { value: { rev: result._rev || '1' } }
              )
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
                { id: result._id, key: result._id },
                { value: { rev: result._rev || '1' } }
              )
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
      const t0 = moment.now();
      bulkOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        const bulk = collection.initializeOrderedBulkOp();
        each(docs, (doc) => {
          if(doc._rev)
            bulk.find({ _id: doc._id }).upsert().updateOne(doc);
          else
            bulk.insert(defaults(doc, { _rev: '1' }));
        });
        bulk.execute((err, res) => err ? cb(error(err)) :
          cb(null, map(docs, (doc) => ({
            ok: true,
            id: doc._id,
            rev: doc._rev ? doc._rev : '1'
          })))
        );
      }, 'write', map(docs, (doc) => dbify(doc)),
      opt, dbopt.partition, pool, (err, rows) => {
        perf.report('db.bulkDocs', t0);
        if (err && err.code && err.code === 11000)
          // Warning: mutating variable err, but that's intentional
          err.status = 409;
        cb(error(err), rows);
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
          return cb(null, map(map(docs, (doc) =>
            ({ doc: find(res, (r) => doc._id === r._id) })
          ), (row) => ({
            doc: row.doc ? extend({ _rev: '1' }, row.doc) : row.doc
          })));
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
      const t0 = moment.now();
      batchOp((db, docs, opt, cb) => {
        // Update the proper subset of the list of docs on each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        const bulk = collection.initializeOrderedBulkOp();
        each(docs, (doc) => {
          if (doc._rev)
            bulk.find({ _id: doc._id }).upsert().updateOne(doc);
          else
            bulk.insert(defaults(doc, { _rev: '1' }));
        });
        bulk.execute((err, res) => err ? cb(error(err)) :
          cb(null, map(docs, (doc) => ({
            ok: true,
            id: doc._id,
            rev: doc._rev ? doc._rev : '1'
          })))
        );
      }, 'write', map(batch, (args) => dbify(args[0])),
      {}, dbopt.partition, pool, (err, rows) => {
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
      const t0 = moment.now();
      batchOp((db, docs, opt, cb) => {
        // Remove the proper subset of the list of docs on each
        // selected db partition
        const collection = db.collection(getCollectionName(db));
        collection.deleteMany({
          _id: { $in: pluck(docs, '_id') }
        }, opt, (err, res) => err ? cb(error(err)) :
          cb(null, map(docs, (doc) => ({
            ok: true,
            id: doc._id,
            rev: doc._rev ? doc._rev : '1'
          })))
        );
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

// Drop all partitions on the specified server that match the specified regex
const dropServerPartitions = (server, regex, cb) => {
  // Connect to the server
  const options = dbOpts();
  debug('Connecting to %s with options %o', server, options);
  mongoDB.connect(server, options, (err, db) => {
    if (err) {
      edebug('Failed to connect to %s because of %o', server, err);
      return cb(err);
    }

    // List all partitions on the server
    const mode = getPartitioningMode(server);
    return listPartitions(server, db, mode, (err, partitions) => {
      if (err) {
        db.close();
        return cb(err);
      }

      // Find the partitions that match the specified regex
      const matchingPartitions = filter(partitions, (p) => regex.exec(p));
      return transform.map(matchingPartitions, (partition, i, l, cb) => {
        // Drop the partition
        dropPartition(server, db, partition, mode, cb);
      }, (err) => {
        if (err) {
          db.close();
          return cb(err);
        }

        db.close();
        return cb(null, matchingPartitions);
      });
    });
  });
};

// Drop all partitions that match the specified regex
const dropPartitions = (servers, regex, cb) => {
  debug('Deleting partitions matching %s on all servers', regex);

  transform.map(servers, (server, i, servers, cb) => {
    dropServerPartitions(server, regex, cb);
  }, (err, deletedPartitions) => {
    if (err)
      return cb(err);

    const result = [].concat.apply([], deletedPartitions);
    if(result.length > 0)
      debug('Deleted partitions: %o', result);
    else
      debug('No partitions were deleted');
    return cb(null, result);
  });
};

// Delete all partitions that match the specified regex
// WARNING: This function deletes partitions (that is, databases or collections)
// also on remote servers. Use with caution!
const deletePartitions = (server, regex, cb) => {
  const servers = Array.isArray(server) ? server :
    server.includes('|') ? server.split('|') : [server];
  dropPartitions(servers, regex, cb);
};

// Drop all databases on the specified server that match the specified regex
const dropServerDatabases = (server, regex, cb) => {
  // Connect to the server
  const options = dbOpts();
  debug('Connecting to %s with options %o', server, options);
  mongoDB.connect(server, options, (err, db) => {
    if (err) {
      edebug('Failed to connect to %s because of %o', server, err);
      return cb(err);
    }

    // List all databases
    return listDatabases(server, db, (err, dbs) => {
      if (err) {
        db.close();
        return cb(err);
      }

      // Find the dbs that match the specified regex
      const matchingDatabases = filter(dbs, (d) => regex.exec(d));
      return transform.map(matchingDatabases, (database, i, l, cb) => {
        // Drop the database
        dropDatabase(server, db, database, cb);
      }, (err) => {
        if (err) {
          db.close();
          return cb(err);
        }

        db.close();
        return cb(null, matchingDatabases);
      });
    });
  });
};

const isLocalServer = (server) => {
  const u = url.parse(server);
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
};

// Drop all databases that match the specified regex
const dropDatabases = (servers, regex, cb) => {
  debug('Deleting databases matching %s on all servers', regex);

  transform.map(servers, (server, i, servers, cb) => {
    if (isLocalServer(server))
      dropServerDatabases(server, regex, cb);
    else {
      debug('Skipping non-local server %s', server);
      cb();
    }
  }, (err, deletedDatabases) => {
    if (err)
      return cb(err);

    const result = [].concat.apply([], deletedDatabases);
    if(result.length > 0)
      debug('Deleted databases: %o', result);
    else
      debug('No databases were deleted');
    return cb(null, result);
  });
};

// Drop all databases that match the specified regex
// This function deletes databases only on local servers
const drop = (server = 'mongodb://localhost:27017', regex, cb) => {
  const servers = Array.isArray(server) ? server :
    server.includes('|') ? server.split('|') : [server];
  dropDatabases(servers, regex, cb);
};

// Export our public functions
module.exports = mongoclient;
module.exports.tkuri = tkuri;
module.exports.kturi = kturi;
module.exports.k = key;
module.exports.t = time;
module.exports.dburi = dburi;
module.exports.getCollectionName = getCollectionName;
module.exports.removeCollectionFromUrl = removeCollectionFromUrl;
module.exports.dbcons = dbcons;
module.exports.dbify = dbify;
module.exports.undbify = undbify;
module.exports.pad16 = pad16;
module.exports.deletePartitions = deletePartitions;
module.exports.drop = drop;
