'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

const _ = require('underscore');
const partition = require('cf-abacus-partition');
const transform = require('cf-abacus-transform');
const PouchDB = require('pouchdb');
const memdown = require('memdown');

const values = _.values;
const groupBy = _.groupBy;
const sortBy = _.sortBy;
const map = _.map;
const flatten = _.flatten;
const extend = _.extend;
const clone = _.clone;
const zip = _.zip;
const defaults = _.defaults;

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-dbclient');

// Pad with zeroes up to 16 digits
const pad16 = (t) => {
    const trim = (s) => s[0] === '0' && (s[1] >= '0' && s[1] <= '9') ? trim(s.substr(1)) : s;
    const tt = trim(t.toString());
    const n = parseInt(tt).toString();
    const s = '0000000000000000' + n;
    return s.slice(s.length - 16) + tt.toString().substr(n.length);
};

// Convert a key and time to a URI in the form k/:key/t:time
const kturi = (k, t) => ['k', k, 't', pad16(t)].join('-');

// Convert a key and time to a URI in the form t/:time/k/:key
const tkuri = (k, t) => ['t', pad16(t), 'k', k].join('-');

// Return the time in a URI containing a t/:time pattern, the time can have
// multiple segments separated by / as well
const time = (uri) => {
    const tk = /^t-(.*)-k-/.exec(uri);
    const t = tk ? tk[1] : /-t-(.*)/.exec(uri)[1];
    debug('Extracted time %s from %s', t, uri);
    return t;
};

// Return the key in a URI containing a k/:key pattern, the key can have
// multiple segments separated by / as well
const key = (uri) => {
    const kt = /^k-(.*)-t-/.exec(uri);
    const k = kt ? kt[1] : /-k-(.*)/.exec(uri)[1];
    debug('Extracted key %s from %s', k, uri);
    return k;
};

// Return a db uri naming function configured with a db uri prefix
const dburi = (prefix) => (p) => [prefix, p.join('-')].join('-');

// Construct a db handle for a db uri, use the memdown adapter to create an
// local in-memory db if the uri is just a local name not containing a :
const dbcons = (uri, opt, cb) => cb(undefined, /:/.test(uri) ?
    new PouchDB(uri, defaults(opt || {}, { ajax: { rejectUnauthorized: false }})) : new PouchDB(uri, defaults(opt || {}, { db: memdown })));

// Return a db handle for an erroneous db partition, which will return
// the given error on all db operations
const errdb = (name, err) => ({
    _db_name: name,
    get: (id, cb) => process.nextTick(() => cb(err)),
    put: (doc, cb) => process.nextTick(() => cb(err)),
    remove: (doc, cb) => process.nextTick(() => cb(err)),
    allDocs: (opt, cb) => process.nextTick(() => cb(err)),
    bulkDocs: (docs, opt, cb) => process.nextTick(() => cb(err))
});

// Return the db handle of the partition to use for a given key and time
const dbpartition = (k, t, rw, part, pool, cb) => {
    part(k, t, rw, (err, p) => err ? cb(null, errdb(dburi('partition-err')([k, t]), err)) : pool(p, cb));
};

// Run a single db operation on a doc, using the given partition and db pool
// functions to select and obtain the proper db partition
const singleOp = (op, rw, doc, part, pool, cb) => {
    dbpartition(key(doc._id), time(doc._id), rw, part, pool, (err, db) => err ? cb(err) : op(db, doc, cb));
};

// Run a db operation on a batch of docs, using the given partition and db
// pool functions to select and obtain the proper db partitions. The docs
// are first arranged in one individual group per selected db partition, then
// the db operation is applied to each group and the corresponding partition.
// Finally the db operation results are assembled back into a single list of
// results in the order of the given list of docs.
const batchOp = (op, rw, docs, opt, part, pool, cb) => {

    // Build a map of requested docs to target dbs
    transform.map(docs, (doc, i, docs, mcb) => {

        // Return each doc with its index in the request list and the mapped db
        dbpartition(key(doc._id), time(doc._id), rw, part, pool, (err, db) => err ? mcb(err) : mcb(null, { i: i, doc: doc, db: db }));

    }, (err, maps) => {
        if(err) return cb(err);

        // Group the doc maps by db
        const groups = values(groupBy(maps, (map) => map.db._db_name));

        // Apply the requested db operation to each group
        transform.map(groups, (gmaps, i, groups, mcb) => {
            // Return a zip of the requests and corresponding results lists
            op(gmaps[0].db, map(gmaps, (map) => map.doc), opt, (err, rows) => {
                return mcb(null, zip(gmaps, err ? map(gmaps, (map) => ({ error: err })) : rows));
            });

        }, (err, grows) => {
            if(err) return cb(err);

            // Assemble the resulting rows into a single list of rows ordered
            // like the requested docs
            cb(null, map(sortBy(flatten(grows, true), (row) => row[0].i), (row) => row[1]));
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

    // Build a map of requested docs to target dbs
    transform.map(docs, (doc, i, docs, mcb) => {

        // Return each doc with its index in the request list and the mapped db
        dbpartition(key(doc._id), time(doc._id), rw, part, pool, (err, db) => err ? mcb(err) : mcb(null, { i: i, doc: doc, db: db }));

    }, (err, maps) => {
        if(err) return cb(err);

        // Group the doc maps by db
        const groups = values(groupBy(maps, (map) => map.db._db_name));

        // Apply the requested db operation to each group
        transform.map(groups, (gmaps, i, groups, mcb) => {
            // Return a zip of the requests and corresponding results lists
            op(gmaps[0].db, map(gmaps, (map) => map.doc), opt, (err, rows) => err ? mcb(err) : mcb(null, zip(gmaps, rows)));

        }, (err, grows) => {
            if(err) return cb(err);

            // Assemble the resulting rows into a single list of rows ordered
            // like the requested docs
            cb(null, map(sortBy(flatten(grows, true), (row) => row[0].i), (row) => row[1]));
        });
    });
};

// Return the db handles of the partitions to use for a given key and a time
// range
const dbpartitions = (k, t, rw, part, pool, cb) => {
    part(k, t, rw, (err, pars) => err ? cb(err) : transform.map(pars, (p, i, pars, pcb) => pool(p, pcb), cb));
};

// Run a db operation on a range of keys, using the given partition and db
// pool functions to select and obtain the proper db partitions. The db
// operation is run on the partitions in sequence until the requested number
// of rows is returned.
const rangeOp = (op, rw, docs, opt, part, pool, cb) => {

    // Compute the db partitions to use
    dbpartitions(key(docs[0]._id), [time(docs[0]._id), time(docs[1]._id)], rw, part, pool, (err, dbs) => {
        if(err) return cb(err);

        // Apply the given db operation to each db and accumulate the results
        transform.reduce(dbs, (accum, db, i, dbs, rcb) => {

            // Stop once we've accumulated the requested number of rows
            if(opt.limit && accum.length === opt.limit) return rcb(undefined, accum);

            // Apply the db operation, with an adjusted row limit if needed
            op(db, docs, opt.limit ? extend(clone(opt), { limit: opt.limit - accum.length }) : opt, (err, rows) => err ? rcb(err) : rcb(undefined, accum.concat(rows)));
        }, [], cb);
    });
};

// Return a db object implementing a subset of the PouchDB API over a set of
// db partitions
const dbclient = (part, uri, cons) => {
    const dbopt = defaults(
        { partition: part, uri: uri, cons: cons }, { partition: partition, uri: dburi('db'), cons: (uri, cb) => dbcons(uri, undefined, cb) });

    // Pool of memoized db partition handles
    // Warning: partitions is a mutable variable, but that's the point of
    // memoization anyway
    const partitions = [];
    const pool = (p, cb) => {
        // Convert db partition to a db name
        const u = dbopt.uri(p);
        debug('Using db %s', u);

        // Return memoized db partition handle or get and memoize a new one
        // from the given db constructor
        return partitions[u] ? cb(null, partitions[u]) : dbopt.cons(u, (err, db) => {
            debug('Constructing db handle %s', u);
            if(err) return cb(null, errdb('dbcons-err-' + u, err));
            // Warning: mutating variable partitions
            partitions[u] = db;
            cb(null, db);
        });
    };

    return {
        fname: 'dbclient',

        // Get a single doc
        get: (id, cb) => {
            debug('Getting doc %s', id);
            singleOp((db, doc, cb) => {
                db.get(doc._id, (err, val) => err && err.name === 'not_found' ? cb(null, undefined) : cb(err, val));
            }, 'read', { _id: id }, dbopt.partition, pool, cb);
        },

        // Put a single doc
        put: (doc, cb) => {
            debug('Putting doc %o', doc);
            singleOp((db, doc, cb) => {
                db.put(doc, cb);
            }, 'write', doc, dbopt.partition, pool, cb);
        },

        // Remove a single doc
        remove: (doc, cb) => {
            debug('Removing doc %o', doc);
            singleOp((db, doc, cb) => {
                db.remove(doc, cb);
            }, 'write', doc, dbopt.partition, pool, cb);
        },

        // Get a list of docs
        allDocs: (opt, cb) => {
            debug('Getting a list of docs %o', opt);
            if(opt.startkey && opt.endkey)
                // Search for docs with keys in the given range
                rangeOp((db, docs, opt, cb) => {
                    // Get the documents in the given range from each selected
                    // db partition
                    db.allDocs(opt, (err, res) => err ? cb(err) : cb(null, res.rows));

                }, 'read', [{ _id: opt.startkey }, { _id: opt.endkey }], opt, dbopt.partition, pool, (err, rows) => err ? cb(err) : cb(null, { rows: rows }));
            else
                // Search for docs with the given keys
                bulkOp((db, docs, opt, cb) => {
                    // Get the proper subset of the list of docs from each
                    // selected db partition
                    db.allDocs(extend(clone(opt), { keys: map(docs, (doc) => doc._id) }), (err, res) => err ? cb(err) : cb(null, res.rows));

                }, 'read', map(opt.keys, (id) => ({ _id: id })), opt, dbopt.partition, pool, (err, rows) => err ? cb(err) : cb(null, { rows: rows }));
        },

        // Update a list of docs
        bulkDocs: (docs, opt, cb) => {
            debug('Updating list of docs %o', docs);
            bulkOp((db, docs, opt, cb) => {
                // Update the proper subset of the list of docs on each
                // selected db partition
                db.bulkDocs(docs, opt, (err, res) => err ? cb(err) : cb(null, res));

            }, 'write', docs, opt, dbopt.partition, pool, cb);
        },

        // Batch versions of the above functions, for use with batch.batchify

        // Batch version of get
        batch_get: (batch, cb) => {
            debug('Getting a batch of docs', batch);
            // Convert a batch of gets to a bulk operation
            const opt = { include_docs: true };
            batchOp((db, docs, opt, cb) => {
                // Get the proper subset of the list of docs from each
                // selected db partition
                db.allDocs(extend(clone(opt), { keys: map(docs, (doc) => doc._id) }), (err, res) => err ? cb(err) : cb(null, res.rows));

            }, 'read', map(batch, (args) => ({ _id: args[0] })), opt, dbopt.partition, pool, (err, rows) => {
                return err ? cb(err) : cb(null, map(rows, (row) => {
                    if(row.error)
                        return row.error === 'not_found' ? [null, undefined] : [row.error, undefined];
                    if(row.doc === null)
                        return row.value !== null && row.value.deleted ? [null, undefined] : [PouchDB.Errors.UNKNOWN_ERROR, undefined];
                    return [null, row.doc];
                }));
            });
        },

        // Batch version of put
        batch_put: (batch, cb) => {
            debug('Putting a batch of docs %o', batch);
            // Convert a batch of puts to a bulk operation
            batchOp((db, docs, opt, cb) => {
                // Update the proper subset of the list of docs on each
                // selected db partition
                db.bulkDocs(docs, opt, (err, res) => err ? cb(err) : cb(null, res));

            }, 'write', map(batch, (args) => args[0]), {}, dbopt.partition, pool, (err, rows) => {
                return err ? cb(err) : cb(null, map(rows, (row) => {
                    return row.error === true ? [row, undefined] : row.error ? [row.error, undefined] : [null, row];
                }));
            });
        },

        // Batch version of remove
        batch_remove: (batch, cb) => {
            debug('Removing a batch of docs %o', batch);
            // Convert a batch of removes to a bulk operation
            batchOp((db, docs, opt, cb) => {
                // Remove the proper subset of the list of docs on each
                // selected db partition
                db.bulkDocs(docs, opt, (err, res) => err ? cb(err) : cb(null, res));

            }, 'write', map(batch, (args) => extend(clone(args[0]), { _deleted: true })), {}, dbopt.partition, pool, (err, rows) => {
                return err ? cb(err) : cb(null, map(rows, (row) => {
                    return row.error ? [row.error, undefined] : [null, row];
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

