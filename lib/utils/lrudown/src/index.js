'use strict';

// A Leveldown adapter for the popular Node LRU module.

const _ = require('underscore');
const util = require('util');
const abstractdown = require('abstract-leveldown');
const lru = require('lru-cache');

const AbstractLevelDown = abstractdown.AbstractLevelDOWN;

const extend = _.extend;
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
  if(!(this instanceof LRUDown)) return new LRUDown(loc);
  const k = toKey(loc);
  debug('New db %s', k);
  AbstractLevelDown.call(this, k);
  this._loc = k ? k : '_lru';
};
util.inherits(LRUDown, AbstractLevelDown);

LRUDown.prototype._open = function(options, cb) {
  debug('Opening db %s with options %o', this._loc, options);
  const opt = extend({}, {
    max: 64 * 1024,
    length: (n) => n.length,
    dispose: (key, n) => {
    },
    maxAge: 1000 * 60 * 5
  }, options);
  this._cache = caches[this._loc] || (caches[this._loc] = {
      docs: lru(opt),
      meta: meta()
    });
  process.nextTick(() => cb(null, this));
};

// Get an value from the cache
LRUDown.prototype._get = function(key, options, cb) {
  const k = toKey(key);
  debug('Getting key %s from db %s', k, this._loc);
  const value = store(this._cache, k).get(k);
  if(!value) {
    debug('Key %s not found in db %s', k, this._loc);
    return process.nextTick(function() {
      cb(new Error('NotFound'));
    });
  }
  process.nextTick(() => cb(null, value));
};

// Put a value into the cache
LRUDown.prototype._put = function(key, value, options, cb) {
  const k = toKey(key);
  debug('Putting key %s value %s into db %s', k, value, this._loc);
  store(this._cache, k).set(k, value);
  if(cb) process.nextTick(cb);
};

// Delete a value from the cache
LRUDown.prototype._del = function(key, options, cb) {
  const k = toKey(key);
  debug('Deleting key %s from db %s', k, this._loc);
  store(this._cache, k).del(k);
  if(cb) process.nextTick(cb);
};

// Apply a batch of updates to the cache
LRUDown.prototype._batch = function(batch, options, cb) {
  debug('Applying batch of updates to db %s', this._loc);
  const self = this;
  map(batch,
    (r) => r.type === 'put' ? self._put(r.key, r.value) :
    r.type === 'del' ? self._del(r.key) : undefined);
  process.nextTick(cb);
};

LRUDown.destroy = (loc, cb) => {
  const k = toKey(loc);
  debug('Destroying db %s', k);
  delete caches[k]
  ;
  process.nextTick(cb);
};

// Export our public functions
module.exports = LRUDown;

