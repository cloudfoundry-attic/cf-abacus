'use strict';

// A Leveldown adapter for the popular Node LRU module.

const _ = require('underscore');
const util = require('util');
const abstractdown = require('abstract-leveldown');
const lru = require('abacus-lrucache');

const AbstractLevelDown = abstractdown.AbstractLevelDOWN;

const defaults = _.defaults;
const map = _.map;

// Setup debug log
const debug = require('abacus-debug')('abacus-lrudown');

// The set of allocated LRU caches
const caches = {};

// Return an in-memory store for db metadata
const meta = () => {
  const values = {};
  return {
    set: (k, val) => values[k] = val,
    get: (k) => values[k],
    del: (k) => delete values[k]
  };
};

// Return the type of store to use for a key
const store = (cache, key) =>
  /\xffdocument-store\xff/.test(key) ? cache.docs : cache.meta;

// Convert a key to a string key we can use in an LRU cache
const toKey = (key) =>
  typeof key === 'string' ? '$' + key : JSON.stringify(key);

// Constructs a new LRUDown adapter that inherits from the abstract LevelDown
const LRUDown = function(loc) {
  if(!(this instanceof LRUDown))
    return new LRUDown(loc);
  const k = toKey(loc);
  debug('New db %s', k);
  AbstractLevelDown.call(this, k);
  this._loc = k ? k : '_lru';
  return this;
};
util.inherits(LRUDown, AbstractLevelDown);

LRUDown.prototype._open = function(options, cb) {
  debug('Opening db %s with options %o', this._loc, options);
  const opt = defaults(options, {
    max: 10000,
    maxAge: 1000 * 3600 * 72
  });
  this._cache = caches[this._loc] || (caches[this._loc] = {
    docs: lru(opt),
    meta: meta()
  });
  setImmediate(() => cb(null, this));
};

// Get an value from the cache
LRUDown.prototype._get = function(key, options, cb) {
  const k = toKey(key);
  debug('Getting key %s from db %s', k, this._loc);
  const value = store(this._cache, k).get(k);
  if(!value) {
    debug('Key %s not found in db %s', k, this._loc);
    setImmediate(function() {
      cb(new Error('NotFound'));
    });
    return;
  }
  setImmediate(() => cb(null, value));
};

// Put a value into the cache
LRUDown.prototype._put = function(key, value, options, cb) {
  const k = toKey(key);
  debug('Putting key %s value %s into db %s', k, value, this._loc);
  store(this._cache, k).set(k, value);
  if(cb) setImmediate(cb);
};

// Delete a value from the cache
LRUDown.prototype._del = function(key, options, cb) {
  const k = toKey(key);
  debug('Deleting key %s from db %s', k, this._loc);
  store(this._cache, k).del(k);
  if(cb) setImmediate(cb);
};

// Apply a batch of updates to the cache
LRUDown.prototype._batch = function(batch, options, cb) {
  debug('Applying batch of updates to db %s', this._loc);
  const self = this;
  map(batch,
    (r) => r.type === 'put' ? self._put(r.key, r.value) :
    r.type === 'del' ? self._del(r.key) : undefined);
  setImmediate(cb);
};

LRUDown.destroy = (loc, cb) => {
  const k = toKey(loc);
  debug('Destroying db %s', k);
  delete caches[k]
  ;
  setImmediate(cb);
};

// Export our public functions
module.exports = LRUDown;

