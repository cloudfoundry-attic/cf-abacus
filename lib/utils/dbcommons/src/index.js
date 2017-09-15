'use strict';

// Distribute DB operations over a set of DB partitions.

const transform = require('abacus-transform');

const _ = require('underscore');
const extend = _.extend;
const first = _.first;
const flatten = _.flatten;
const groupBy = _.groupBy;
const map = _.map;
const omit = _.omit;
const rest = _.rest;
const sortBy = _.sortBy;
const values = _.values;
const zip = _.zip;

// Setup debug log
const debug = require('abacus-debug')('abacus-dbcommons');
const edebug = require('abacus-debug')('e-abacus-dbcommons');

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
  if (tk) {
    debug('Extracted time %s from %s', tk[1], uri);
    return tk[1];
  }
  const t = /\/t\/(.*)/.exec(uri);
  if (t) {
    debug('Extracted time %s from %s', t[1], uri);
    return t[1];
  }
  // Indeed a greedy search
  const tg = /t\/(.*)/.exec(uri);
  if (tg) {
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
  if (kt) {
    debug('Extracted key %s from %s', kt[1], uri);
    return kt[1];
  }
  const k = /\/k\/(.*)/.exec(uri);
  if (k) {
    debug('Extracted key %s from %s', k[1], uri);
    return k[1];
  }
  // Indeed a greedy search
  const kg = /k\/(.*)/.exec(uri);
  if (kg) {
    debug('Extracted key %s from %s', kg[1], uri);
    return kg[1];
  }
  debug('No key found in %s', uri);
  return undefined;
};

// Convert a URI to a printable URI, with the optional user and password
// replaced by stars
const puri = (u) => u ? u.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : undefined;

// Return the db handle of the partition to use for a given key and time
const dbPartition = (k, t, rw, part, pool, dbopt, cb) => {
  part(k, t, rw, (err, p) => {
    if (err)
      dbopt.uri([k, t], (uriErr, u) => {
        if (uriErr)
          cb(uriErr);
        else
          cb(null, dbopt.errdb(u, err));
      });
    else
      pool(p, rw, cb);
  });
};

// Return the db handles of the partitions to use for a given key and a time
// range
const dbPartitions = (k, t, rw, part, pool, dbopt, cb) => {
  part(k, t, rw, (err, pars) => err ?
    cb(err) :
    transform.map(pars, (p, i, pars, pcb) => pool(p, rw, pcb), cb));
};

// Run a single db operation on a doc, using the given partition and db pool
// functions to select and obtain the proper db partition
const singleOp = (op, rw, doc, part, pool, dbopt, cb) => {
  const lcb = (err, res) => {
    if (err) edebug('Single db op failed, error %o', err);
    cb(err, res);
  };
  dbPartition(key(doc._id), time(doc._id), rw, part, pool, dbopt,
    (err, db) => err ? lcb(err) : op(db, doc, lcb));
};

// Run a db operation on a batch of docs, using the given partition and db
// pool functions to select and obtain the proper db partitions. The docs
// are first arranged in one individual group per selected db partition, then
// the db operation is applied to each group and the corresponding partition.
// Finally the db operation results are assembled back into a single list of
// results in the order of the given list of docs.
const batchOp = (op, rw, docs, opt, part, pool, dbopt, cb) => {
  const lcb = (err, res) => {
    if (err) edebug('Batch db op failed, error %o', err);
    cb(err, res);
  };

  debug('Batch db op requested for %d docs', docs.length);

  // Build a map of requested docs to target dbs
  transform.map(docs, (doc, i, docs, mcb) => {

    // Return each doc with its index in the request list and the mapped db
    dbPartition(key(doc._id), time(doc._id), rw, part, pool, dbopt,
      (err, db) => err ? mcb(err) : mcb(null, {
        i: i,
        doc: doc,
        db: db
      }));

  }, (err, maps) => {
    if (err) {
      lcb(err);
      return;
    }

    debug('Batch db op starting for ',
      map(maps, (map) => puri(map.db.name)));

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db.name));
    debug('Batch db op split into %d groups', groups.length);

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      debug('Applying db op to batch group with %d docs for db %s',
        gmaps.length, puri(gmaps[0].db.name));

      // Return a zip of the requests and corresponding results lists
      op(gmaps[0].db, map(gmaps, (map) => map.doc), opt, (err, rows) => {
        return mcb(null, zip(gmaps, err ? map(gmaps, (map) => ({
          error: err
        })) : rows));
      });

    }, (err, grows) => {
      if (err) {
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
const bulkOp = (op, rw, docs, opt, part, pool, dbopt, cb) => {
  const lcb = (err, res) => {
    if (err) edebug('Bulk db op failed, error %o', err);
    cb(err, res);
  };

  debug('Bulk db op requested for %d docs', docs.length);

  // Build a map of requested docs to target dbs
  transform.map(docs, (doc, i, docs, mcb) => {

    // Return each doc with its index in the request list and the mapped db
    dbPartition(key(doc._id), time(doc._id), rw, part, pool, dbopt,
      (err, db) => err ? mcb(err) : mcb(null, {
        i: i,
        doc: doc,
        db: db
      }));

  }, (err, maps) => {
    if (err) {
      lcb(err);
      return;
    }

    debug('Bulk db op starting for URLs %j',
      maps.length > 0 ? map(maps, (map) => puri(map.db.name)) : 'unknown');

    // Group the doc maps by db
    const groups = values(groupBy(maps, (map) => map.db.name));
    debug('Bulk db op split into %d groups', groups.length);

    // Apply the requested db operation to each group
    transform.map(groups, (gmaps, i, groups, mcb) => {
      debug('Applying db op to bulk group with %d docs for db %s',
        gmaps.length, puri(gmaps[0].db.name));

      // Return a zip of the requests and corresponding results lists
      op(gmaps[0].db, map(gmaps, (map) => map.doc), opt,
        (err, rows) => err ? mcb(err) : mcb(null, zip(gmaps, rows)));

    }, (err, grows) => {
      if (err) {
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

// Run a db operation on a range of keys, using the given partition and db
// pool functions to select and obtain the proper db partitions. The db
// operation is run on the partitions in sequence until the requested number
// of rows is returned.
const rangeOp = (op, rw, docs, opt, part, pool, dbopt, cb) => {

  const skip = opt.skip ? opt.skip : 0;

  const lcb = (err, res) => {
    if (err) {
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
  dbPartitions(k, [time(docs[0]._id), time(docs[1]._id)], rw, part, pool, dbopt,
    (err, dbs) => {
      if (err) {
        lcb(err);
        return;
      }
      // Apply the given db operation to each db and accumulate the results
      transform.reduce(dbs, (accum, db, i, dbs, rcb) => {
        // Stop once we've accumulated the requested number of rows
        if (opt.limit && accum.length === opt.limit) {
          rcb(undefined, accum);
          return;
        }
        // If db is an array, search in all dbs.
        if (Array.isArray(db))
          transform.map(db, (v, i, l, mcb) => {
            debug('Running operation in db %s', v.name);
            op(v, docs, opt.limit ? extend({}, opt, {
              limit: opt.limit - accum.length + skip,
              skip: 0
            }) : extend({}, opt, { skip: 0 }),
              (err, rows) => err ? mcb(err) : mcb(undefined, rows));
          }, (err, rows) => {
            if (err) {
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

// Add the required db metadata fields to a doc
const dbify = (doc, ext, omitId) => {
  const clearedDoc = omitId ? omit(doc, 'id') : doc;
  const dbifiedDoc = !doc._id ? extend({}, clearedDoc, {
    _id: doc.id
  }) : doc;
  return ext ? extend(dbifiedDoc, ext) : dbifiedDoc;
};

// Remove db metadata fields from a doc
const undbify = (doc) => {
  const clearedDoc = omit(doc, '_id', '_rev');
  return doc._id || doc._rev ? extend(clearedDoc, { id: doc._id }) : clearedDoc;
};

const readAllPages = (db, opt, processingFn, cb) => {
  debug('Reading usage data from %s to %s with limit %d',
    opt.startId, opt.endId, opt.pageSize);

  db.allDocs({
    include_docs: true,
    startkey: opt.startId,
    endkey: opt.endId,
    limit: opt.pageSize,
    skip: opt.skip ? opt.skip : 0
  }, (error, dbDocs) => {
    if (error) {
      cb(error);
      return;
    }

    const docs = dbDocs.rows;

    debug('Found %d DB documents ...', docs.length);
    processingFn(docs, (processingError) => {
      if (processingError) {
        cb(processingError);
        return;
      }

      if (docs.length < opt.pageSize) {
        debug('Processed all DB documents.');
        cb();
        return;
      }

      readAllPages(
        db,
        extend({}, opt, { skip: opt.skip + docs.length }),
        processingFn, cb
      );
    });
  });
};


// Export our public functions
module.exports = (dbOptions = {}) => ({
  batchOp: (op, rw, docs, opt, part, pool, cb) =>
    batchOp(op, rw, docs, opt, part, pool, dbOptions, cb),
  bulkOp: (op, rw, docs, opt, part, pool, cb) =>
    bulkOp(op, rw, docs, opt, part, pool, dbOptions, cb),
  dbify: (doc, ext) =>
    dbify(doc, ext, dbOptions.omit_id === undefined ? true : dbOptions.omit_id),
  k: key,
  kturi: kturi,
  pad16: pad16,
  puri: puri,
  rangeOp: (op, rw, docs, opt, part, pool, cb) =>
    rangeOp(op, rw, docs, opt, part, pool, dbOptions, cb),
  singleOp: (op, rw, doc, part, pool, cb) =>
    singleOp(op, rw, doc, part, pool, dbOptions, cb),
  readAllPages: readAllPages,
  t: time,
  tkuri: tkuri,
  undbify: undbify
});
