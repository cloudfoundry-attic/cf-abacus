'use strict';

// Small utility that provides a subset of the MongoDB API over a set of DB
// partitions

const _ = require('underscore');
const purify = require('abacus-dbcommons')().puri;
const lock = require('abacus-lock');
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const request = require('abacus-request');
const transform = require('abacus-transform');
const mongoDB = require('mongodb').MongoClient;
const url = require('url');

const contains = _.contains;
const defaults = _.defaults;
const each = _.each;
const extend = _.extend;
const filter = _.filter;
const find = _.find;
const map = _.map;
const omit = _.omit;
const pluck = _.pluck;

// Setup debug log
const debug = require('abacus-debug')('abacus-mongoclient');
const edebug = require('abacus-debug')('e-abacus-mongoclient');
const pdebug = require('abacus-debug')('p-abacus-mongoclient');

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

const dbOpts = (opt) => {
  const defaultOpts = process.env.DB_OPTS ? JSON.parse(process.env.DB_OPTS) : {};
  return defaults(opt || {}, defaultOpts, {
    poolSize: 1
  });
};

// List all databases on the specified server
const listDatabases = (server, db, cb) => {
  debug('Listing databases on %s', purify(server));
  db.admin().listDatabases((err, dbs) => {
    if (err) {
      edebug('Failed to list databases on %s because of %o', purify(server), err);
      return cb(err);
    }

    // Return all database names
    return cb(null, map(dbs.databases, (d) => d.name));
  });
};

// List all collections on the specified server
const listCollections = (server, db, cb) => {
  debug('Listing collections on %s', purify(server));
  db.listCollections().toArray((err, collections) => {
    if (err) {
      edebug('Failed to list collections on %s because of %o', purify(server), err);
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
  if (mode === 'db') listDatabases(server, db, cb);
  else listCollections(server, db, cb);
};

// Drop the specified database on the specified server
const dropDatabase = (server, db, database, cb) => {
  debug('Dropping database %s on %s', database, purify(server));
  db.db(database).dropDatabase((err) => {
    if (err) {
      edebug('Failed to drop database %s on %s because of %o', database, purify(server), err);
      return cb(err);
    }

    return cb(null);
  });
};

// Drop the specified collection on the specified server
const dropCollection = (server, db, collection, cb) => {
  debug('Dropping collection %s on %s', collection, purify(server));
  db.collection(collection).drop((err) => {
    if (err) {
      edebug('Failed to drop collection %s on %s because of %o', collection, purify(server), err);
      return cb(err);
    }

    return cb(null);
  });
};

// Drop the specified partition on the specified server
// Depending on the partition mode, drops either a database or a collection
const dropPartition = (server, db, partition, mode, cb) => {
  if (mode === 'db') dropDatabase(server, db, partition, cb);
  else dropCollection(server, db, partition, cb);
};

// Drop all partitions on the specified server that match the specified regex
const dropServerPartitions = (server, regex, cb) => {
  // Connect to the server
  const options = dbOpts();
  debug('Connecting to %s with options %o', purify(server), options);
  mongoDB.connect(server, options, (err, db) => {
    if (err) {
      edebug('Failed to connect to %s because of %o', purify(server), err);
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
      return transform.map(
        matchingPartitions,
        (partition, i, l, cb) => {
          // Drop the partition
          dropPartition(server, db, partition, mode, cb);
        },
        (err) => {
          if (err) {
            db.close();
            return cb(err);
          }

          db.close();
          return cb(null, matchingPartitions);
        }
      );
    });
  });
};

// Drop all partitions that match the specified regex
const dropPartitions = (servers, regex, cb) => {
  debug('Deleting partitions matching %s on all servers', regex);

  transform.map(
    servers,
    (server, i, servers, cb) => {
      dropServerPartitions(server, regex, cb);
    },
    (err, deletedPartitions) => {
      if (err) return cb(err);

      const result = [].concat.apply([], deletedPartitions);
      if (result.length > 0) debug('Deleted partitions: %o', result);
      else debug('No partitions were deleted');
      return cb(null, result);
    }
  );
};

// Delete all partitions that match the specified regex
// WARNING: This function deletes partitions (that is, databases or collections)
// also on remote servers. Use with caution!
const deletePartitions = (server, regex, cb) => {
  const servers = Array.isArray(server) ? server : server.includes('|') ? server.split('|') : [server];
  dropPartitions(servers, regex, cb);
};

// Drop all databases on the specified server that match the specified regex
const dropServerDatabases = (server, regex, cb) => {
  // Connect to the server
  const options = dbOpts();
  debug('Connecting to %s with options %o', purify(server), options);
  mongoDB.connect(server, options, (err, db) => {
    if (err) {
      edebug('Failed to connect to %s because of %o', purify(server), err);
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
      return transform.map(
        matchingDatabases,
        (database, i, l, cb) => {
          // Drop the database
          dropDatabase(server, db, database, cb);
        },
        (err) => {
          if (err) {
            db.close();
            return cb(err);
          }

          db.close();
          return cb(null, matchingDatabases);
        }
      );
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

  transform.map(
    servers,
    (server, i, servers, cb) => {
      if (isLocalServer(server)) dropServerDatabases(server, regex, cb);
      else {
        debug('Skipping non-local server %s', purify(server));
        cb();
      }
    },
    (err, deletedDatabases) => {
      if (err) return cb(err);

      const result = [].concat.apply([], deletedDatabases);
      if (result.length > 0) debug('Deleted databases: %o', result);
      else debug('No databases were deleted');
      return cb(null, result);
    }
  );
};

// Drop all databases that match the specified regex
// This function deletes databases only on local servers
const drop = (server = 'mongodb://localhost:27017', regex, cb) => {
  const servers = Array.isArray(server) ? server : server.includes('|') ? server.split('|') : [server];
  dropDatabases(servers, regex, cb);
};

// Find a server that already contains the specified partition
const findServer = (servers, partition, cb) => {
  debug('Looking for partition %s on all servers', partition);

  // Filter all servers that already contain the specified partition
  const options = dbOpts();
  transform.filter(
    servers,
    (server, i, servers, cb) => {
      // Connect to the server
      debug('Connecting to %s with options %o', purify(server), options);
      mongoDB.connect(server, options, (err, db) => {
        if (err) {
          edebug('Failed to connect to %s because of %o', purify(server), err);
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
    },
    (err, servers) => {
      if (err) return cb(err);

      // Return the first server or undefined if no servers were found
      const server = servers.length > 0 ? servers[0] : undefined;
      if (server) debug('Partition %s found on server %s', partition, purify(server));
      else debug('Partition %s not found on any server', partition);
      return cb(null, server);
    }
  );
};

// Memoized partition servers
const partitionServers = {};

// Get a server for the specified partition
// If it already exists on any of the servers, that server is returned
// Otherwise, a server is assigned based on the partition index
const getServer = (partition, servers, p, cb) => {
  // If a single server, return it
  if (servers.length === 1) return cb(null, servers[0]);

  return lock(partition, (err, unlock) => {
    // Return a memoized partition server
    if (partitionServers[partition]) return unlock(cb(null, partitionServers[partition]));

    // Find a server that already contains the partition
    return findServer(servers, partition, (err, found) => {
      if (err) return unlock(cb(err));

      // Use the found server, or assign one if not found
      const server = found ? found : servers[p[0] % servers.length];
      partitionServers[partition] = server;
      return unlock(cb(null, server));
    });
  });
};

// Return a db uri naming function configured with a db uri name prefix
const dburi = (server, name) => {
  if (!server) return (partition, cb) => cb(null, [name, partition.join('-')].join('-'));

  // Compose a db uri from a server uri, name, and partition infos
  const composeDBUri = (server, partition, cb) => {
    const queryOpts = url.parse(server).search;
    const srv = queryOpts ? server.replace(queryOpts, '') : server;
    const path = /:name/.test(srv)
      ? request.route(srv, {
          name: name
        })
      : [srv, name].join('/');

    cb(null, queryOpts ? [path, partition.join('-')].join('-') + queryOpts : [path, partition.join('-')].join('-'));
  };

  // If there are multiple servers, first get a server for the partition
  // and then compose the db uri from that server
  if (Array.isArray(server))
    return (partition, cb) => {
      const partitionName = [name, partition.join('-')].join('-');
      debug('Getting server for partition %s', partitionName);
      getServer(partitionName, server, partition, (err, server) => {
        if (err) return cb(err);
        return composeDBUri(server, partition, cb);
      });
    };

  return (partition, cb) => composeDBUri(server, partition, cb);
};

const removeCollectionFromUrl = (u) => {
  const schemaSeparator = '://';
  const schemaIndex = u.indexOf(schemaSeparator);
  const schema = schemaIndex !== -1 ? u.substring(0, schemaIndex) : undefined;
  const uri = schema ? u.substring(schema.length + 3) : u;

  const parts = uri.split('/');
  if (parts.length < 3) return u;

  const path = [parts[0], parts[1]].join('/');
  const queryOpts = url.parse(parts[2]).search;
  const result = [schema ? [schema, schemaSeparator].join('') : '', path, queryOpts].join('');
  debug('Removing collection from db uri %s. Result: %s', purify(u), result);
  return result;
};

// Construct a db handle for a db uri
const dbcons = (uri, opt, cb) => {
  debug('Constructing db handle for uri %s', purify(uri));
  const url = /:/.test(uri) ? uri : 'mongodb://localhost:27017/' + uri;
  const driverUrl = removeCollectionFromUrl(url);

  const options = dbOpts(opt);
  debug('Connecting to DB on %s with options %o', purify(driverUrl), options);
  mongoDB.connect(driverUrl, options, (err, db) => {
    if (err) edebug('Failed to connect to mongodb uri %s because of %o', purify(url), err);
    else {
      debug('Connected to mongodb uri %s', purify(url));

      // Warning: mutating variable db, but that's intentional
      db.errorDB = false;
      db.name = url;
      db.dbconsOptions = options;
    }
    cb(err, db);
  });
};

// Return a db handle for an erroneous db partition, which will return
// the given error on all db operations
const errdb = (name, err) => ({
  name: name,
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

// Regularly log db call performance stats
if (pdebug.enabled())
  setInterval(() => {
    pdebug('get %o', perf.stats('db.get'));
    pdebug('put %o', perf.stats('db.put'));
    pdebug('remove %o', perf.stats('db.remove'));
    pdebug('allDocs %o', perf.stats('db.allDocs'));
    pdebug('distinctValues %o', perf.stats('db.distinctValues'));
    pdebug('bulkDocs %o', perf.stats('db.bulkDocs'));
  }, 10000);

// Post-process db errors and mark them such that they nicely flow through
// circuit breakers and retries
const error = (err) => {
  if (!err) return err;

  // Ensure we propagate generic Error and not db specific errors
  let e = err;
  if (err.name && err.name === 'MongoError') e = extend(new Error(), omit(err, 'name'));

  if (e.status !== 409 && e.status !== 404) return e;

  // Warning: mutating variable err, but that's intentional
  e.noretry = true;
  e.nobreaker = true;
  return e;
};

const getCollectionName = (db) => {
  const defaultCollection = 'documents';

  if (db.errorDB) {
    debug('Using documents collection for error db %s', purify(db.name));
    return defaultCollection;
  }

  const u = db.name;
  let collection = defaultCollection;

  const schemaSeparator = '://';
  const schemaIndex = u.indexOf(schemaSeparator);
  const schema = schemaIndex !== -1 ? u.substring(0, schemaIndex) : undefined;
  const uri = schema ? u.substring(schema.length + 3) : u;

  const parts = uri.split('/');
  if (parts.length >= 3) {
    const queryOpts = url.parse(parts[2]).search;
    const queryOptsIndex = parts[2].indexOf(queryOpts);
    collection = queryOpts ? parts[2].substring(0, queryOptsIndex) : parts[2];
  }

  debug('Using collection %s for URI %s', collection, purify(uri));
  return collection;
};

// Return a db object implementing a subset of the MongoDB API over a set of
// db partitions
const mongoclient = (partitionFn, uriFn, connectionFn, errorDBFn) => {
  const dbopt = defaults(
    {
      partition: partitionFn,
      uri: uriFn,
      cons: connectionFn,
      errdb: errorDBFn
    },
    {
      partition: partition,
      uri: dburi(undefined, 'db'),
      cons: dbcons,
      errdb: errdb,
      omit_id: false
    }
  );

  const dbops = require('abacus-dbcommons')(dbopt);

  // Pool of memoized db partition handles
  let partitions = {};

  // Get pooled db partition handle(s)
  const pool = (p, rw, cb) => {
    // Get a pooled db partition handle for a single partition
    const pooldb = (p, cb) => {
      debug('Getting db uri for partition %o', p);
      dbopt.uri(p, (err, u) => {
        if (err) return cb(err);
        debug('Using db %s', purify(u));

        // Return a memoized db partition handle or get and memoize a new one
        // from the given db constructor
        return lock(u, (err, unlock) => {
          if (partitions[u]) return unlock(cb(null, partitions[u]));

          debug('Constructing db handle for db %s', purify(u));
          return dbopt.cons(u, {}, (err, db) => {
            if (err) return unlock(cb(null, dbopt.errdb('dbcons-err-' + u, err)));

            // Memoize the db handle
            partitions[u] = db;

            return unlock(cb(null, db));
          });
        });
      });
    };

    if (Array.isArray(p[0])) transform.map(p, (v, i, p, mcb) => pooldb(v, mcb), cb);
    else pooldb(p, cb);
  };

  return {
    fname: 'mongoclient',

    // Get a single doc
    get: (id, cb) => {
      debug('Getting doc %s', id);
      const t0 = moment.now();
      dbops.singleOp(
        (db, doc, cb) => {
          const collection = db.collection(getCollectionName(db));
          collection
            .find({ _id: doc._id })
            .limit(1)
            .next((err, val) => {
              if (!val && !err) {
                cb(null, undefined);
                return;
              }
              cb(error(err), val ? extend({ _rev: '1' }, val) : val);
            });
        },
        'read',
        {
          _id: id
        },
        dbopt.partition,
        pool,
        (err, val) => {
          perf.report('db.get', t0);
          cb(err, val);
        }
      );
    },

    // Put a single doc
    put: (doc, cb) => {
      debug('Putting doc %o', doc);
      const t0 = moment.now();
      dbops.singleOp(
        (db, doc, cb) => {
          const collection = db.collection(getCollectionName(db));
          if (doc._rev)
            // updateOne requires MongoDB 3.2
            collection.update({ _id: doc._id }, doc, { upsert: true }, (err, val) => {
              if (err && err.code && err.code === 11000) {
                // Warning: mutating variable err, but that's intentional
                err.status = 409;
                cb(error(err), undefined);
                return;
              }
              cb(error(err), {
                ok: !val.writeConcernError,
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
        },
        'write',
        dbops.dbify(doc),
        dbopt.partition,
        pool,
        (err, val) => {
          perf.report('db.put', t0);
          cb(err, val);
        }
      );
    },

    // Remove a single doc
    remove: (doc, cb) => {
      debug('Removing doc %o', doc);
      const t0 = moment.now();
      dbops.singleOp(
        (db, doc, cb) => {
          const collection = db.collection(getCollectionName(db));
          collection.deleteOne({ _id: doc._id }, (err, val) =>
            cb(error(err), { ok: true, id: doc._id, rev: doc._rev })
          );
        },
        'write',
        dbops.dbify(doc, {
          _deleted: true
        }),
        dbopt.partition,
        pool,
        (err, val) => {
          perf.report('db.remove', t0);
          cb(err, val);
        }
      );
    },

    // Get a list of docs
    allDocs: (opt, cb) => {
      debug('Getting a list of docs %o', opt);
      const t0 = moment.now();

      // Search for docs with keys in the given range
      if (opt.startkey && opt.endkey)
        dbops.rangeOp(
          (db, docs, opt, cb) => {
            // Get the documents in the given range from each selected
            // db partition
            const collection = db.collection(getCollectionName(db));
            const query =
              opt.descending === true
                ? { $gte: opt.endkey, $lte: opt.startkey }
                : { $gte: opt.startkey, $lte: opt.endkey };
            collection
              .find({ _id: query }, opt.include_docs !== true ? { value: 0 } : {})
              .sort({
                _id: opt.descending !== true ? 1 : -1
              })
              .limit(opt.limit || 0)
              .toArray((err, res) => {
                if (err) return cb(error(err));
                if (!res) {
                  debug('Mapping not_found error to empty rows list');
                  return cb(null, []);
                }
                return cb(
                  null,
                  map(res, (result) =>
                    extend(
                      opt.include_docs === true ? { doc: result } : {},
                      { id: result._id, key: result._id },
                      { value: { rev: result._rev || '1' } }
                    )
                  )
                );
              });
          },
          'read',
          [
            {
              _id: opt.startkey
            },
            {
              _id: opt.endkey
            }
          ],
          opt,
          dbopt.partition,
          pool,
          (err, rows) => {
            perf.report('db.allDocs', t0);
            return err ? cb(err) : cb(null, { rows: rows });
          }
        );
      else
        // Search for docs with the given keys
        dbops.bulkOp(
          (db, docs, opt, cb) => {
            // Get the proper subset of the list of docs from each
            // selected db partition
            const collection = db.collection(getCollectionName(db));
            collection
              .find(
                {
                  _id: { $in: opt.keys }
                },
                opt.include_docs !== true ? { value: 0 } : {}
              )
              .sort({
                _id: opt.descending !== true ? 1 : -1
              })
              .limit(opt.limit || 0)
              .toArray((err, res) => {
                if (err) return cb(error(err));
                if (!res || res.length === 0) {
                  debug('Mapping not_found error to row not_found errors');
                  return cb(
                    null,
                    map(docs, (doc) => ({
                      error: 'not_found'
                    }))
                  );
                }
                return cb(
                  null,
                  map(res, (result) =>
                    extend(
                      opt.include_docs === true ? { doc: result } : {},
                      { id: result._id, key: result._id },
                      { value: { rev: result._rev || '1' } }
                    )
                  )
                );
              });
          },
          'read',
          map(opt.keys, (id) => ({
            _id: id
          })),
          opt,
          dbopt.partition,
          pool,
          (err, rows) => {
            perf.report('db.allDocs', t0);
            return err ? cb(err) : cb(null, { rows: rows });
          }
        );
    },

    // Find the distinct values for the specified field
    distinctValues: (field, opt, cb) => {
      debug('Finding distinct values for field %s with options %o', field, opt);
      const t0 = moment.now();

      // Search for docs with keys in the given range
      if (opt.startkey && opt.endkey)
        dbops.rangeOp(
          (db, docs, opt, cb) => {
            // Get the distinct values of documents in the given range
            // from each selected db partition
            const collection = db.collection(getCollectionName(db));
            const query = { $gte: opt.startkey, $lte: opt.endkey };
            collection.distinct(field, { _id: query }, (err, res) => {
              if (err) return cb(error(err));
              if (!res) {
                debug('Mapping not_found error to an empty list');
                return cb(null, []);
              }
              return cb(null, res);
            });
          },
          'read',
          [
            {
              _id: opt.startkey
            },
            {
              _id: opt.endkey
            }
          ],
          opt,
          dbopt.partition,
          pool,
          (err, values) => {
            perf.report('db.distinctValues', t0);
            return err ? cb(err) : cb(null, values);
          }
        );
      else
        // Search for docs with the given keys
        dbops.bulkOp(
          (db, docs, opt, cb) => {
            // Get the distinct values of the proper subset of the list of docs
            // from each selected db partition
            const collection = db.collection(getCollectionName(db));
            collection.distinct(field, { _id: { $in: opt.keys } }, (err, res) => {
              if (err) return cb(error(err));
              if (!res || res.length === 0) {
                debug('Mapping not_found error to a list of not_found errors');
                return cb(
                  null,
                  map(docs, (doc) => ({
                    error: 'not_found'
                  }))
                );
              }
              return cb(null, res);
            });
          },
          'read',
          map(opt.keys, (id) => ({
            _id: id
          })),
          opt,
          dbopt.partition,
          pool,
          (err, values) => {
            perf.report('db.distinctValues', t0);
            let filteredArr = values.filter((val) => {
              return val !== undefined;
            });
            return err ? cb(err) : cb(null, filteredArr);
          }
        );
    },

    // Update a list of docs
    bulkDocs: (docs, opt, cb) => {
      debug('Updating list of docs %o', docs);
      const t0 = moment.now();
      dbops.bulkOp(
        (db, docs, opt, cb) => {
          // Update the proper subset of the list of docs on each
          // selected db partition
          const collection = db.collection(getCollectionName(db));
          const bulk = collection.initializeOrderedBulkOp();
          each(docs, (doc) => {
            if (doc._rev)
              bulk
                .find({ _id: doc._id })
                .upsert()
                .updateOne(doc);
            else bulk.insert(defaults(doc, { _rev: '1' }));
          });
          bulk.execute(
            (err, res) =>
              err
                ? cb(error(err))
                : cb(
                    null,
                    map(docs, (doc) => ({
                      ok: true,
                      id: doc._id,
                      rev: doc._rev ? doc._rev : '1'
                    }))
                  )
          );
        },
        'write',
        map(docs, (doc) => dbops.dbify(doc)),
        opt,
        dbopt.partition,
        pool,
        (err, rows) => {
          perf.report('db.bulkDocs', t0);
          if (err && err.code && err.code === 11000)
            // Warning: mutating variable err, but that's intentional
            err.status = 409;
          cb(error(err), rows);
        }
      );
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
      dbops.batchOp(
        (db, docs, opt, cb) => {
          // Get the proper subset of the list of docs from each
          // selected db partition
          const collection = db.collection(getCollectionName(db));
          collection
            .find(
              {
                _id: { $in: pluck(docs, '_id') }
              },
              opt.include_docs !== true ? { value: 0 } : {}
            )
            .limit(opt.limit || 0)
            .toArray((err, res) => {
              if (err) return cb(error(err));
              if (!res || res.length === 0) {
                debug('Mapping not_found error to row not_found errors');
                return cb(
                  null,
                  map(docs, (doc) => ({
                    error: 'not_found'
                  }))
                );
              }
              return cb(
                null,
                map(map(docs, (doc) => ({ doc: find(res, (r) => doc._id === r._id) })), (row) => ({
                  doc: row.doc ? extend({ _rev: '1' }, row.doc) : row.doc
                }))
              );
            });
        },
        'read',
        map(batch, (args) => ({
          _id: args[0]
        })),
        opt,
        dbopt.partition,
        pool,
        (err, rows) => {
          perf.report('db.batch_get', t0);
          return err
            ? cb(err)
            : cb(
                null,
                map(rows, (row) => {
                  if (!row) return [null, undefined];
                  if (row.error) return row.error === 'not_found' ? [null, undefined] : [error(row.error), undefined];
                  if (row.doc === null)
                    return row.value !== null && row.value.deleted
                      ? [null, undefined]
                      : [mongoDB.Errors.UNKNOWN_ERROR, undefined];
                  return [null, row.doc];
                })
              );
        }
      );
    },

    // Batch version of put
    batch_put: (batch, cb) => {
      debug('Putting a batch of docs %o', batch);
      // Convert a batch of puts to a bulk operation
      const t0 = moment.now();
      dbops.batchOp(
        (db, docs, opt, cb) => {
          // Update the proper subset of the list of docs on each
          // selected db partition
          const collection = db.collection(getCollectionName(db));
          const bulk = collection.initializeOrderedBulkOp();
          each(docs, (doc) => {
            if (doc._rev)
              bulk
                .find({ _id: doc._id })
                .upsert()
                .updateOne(doc);
            else bulk.insert(defaults(doc, { _rev: '1' }));
          });
          bulk.execute(
            (err, res) =>
              err
                ? cb(error(err))
                : cb(
                    null,
                    map(docs, (doc) => ({
                      ok: true,
                      id: doc._id,
                      rev: doc._rev ? doc._rev : '1'
                    }))
                  )
          );
        },
        'write',
        map(batch, (args) => dbops.dbify(args[0])),
        {},
        dbopt.partition,
        pool,
        (err, rows) => {
          perf.report('db.batch_put', t0);
          return err
            ? cb(err)
            : cb(
                null,
                map(rows, (row) => {
                  if (row.error === true) return [error(row), undefined];
                  if (row.error) {
                    if (row.error.code && row.error.code === 11000)
                      // Warning: mutating variable err, but that's intentional
                      row.error.status = 409;
                    return [error(row.error), undefined];
                  }
                  return [null, row];
                })
              );
        }
      );
    },

    // Batch version of remove
    batch_remove: (batch, cb) => {
      debug('Removing a batch of docs %o', batch);
      // Convert a batch of removes to a bulk operation
      const t0 = moment.now();
      dbops.batchOp(
        (db, docs, opt, cb) => {
          // Remove the proper subset of the list of docs on each
          // selected db partition
          const collection = db.collection(getCollectionName(db));
          collection.deleteMany(
            {
              _id: { $in: pluck(docs, '_id') }
            },
            opt,
            (err, res) =>
              err
                ? cb(error(err))
                : cb(
                    null,
                    map(docs, (doc) => ({
                      ok: true,
                      id: doc._id,
                      rev: doc._rev ? doc._rev : '1'
                    }))
                  )
          );
        },
        'write',
        map(batch, (args) =>
          dbops.dbify(args[0], {
            _deleted: true
          })
        ),
        {},
        dbopt.partition,
        pool,
        (err, rows) => {
          perf.report('db.batch_remove', t0);
          return err
            ? cb(err)
            : cb(
                null,
                map(rows, (row) => {
                  return row.error ? [error(row.error), undefined] : [null, row];
                })
              );
        }
      );
    }
  };
};

// Export our public functions
module.exports = mongoclient;
module.exports.dbcons = dbcons;
module.exports.dburi = dburi;
module.exports.drop = drop;
module.exports.deletePartitions = deletePartitions;
module.exports.errdb = errdb;
module.exports.getCollectionName = getCollectionName;
module.exports.removeCollectionFromUrl = removeCollectionFromUrl;
