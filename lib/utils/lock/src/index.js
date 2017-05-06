'use strict';

// A mini wrapper around the lock module that makes it a bit easier to use.

const Lock = require('lock');

// Setup debug log
const debug = require('abacus-debug')('abacus-lock');

const locks = {};

const locker = function(name) {
  const n = name || 'default';
  if(!locks[n])
    locks[n] = new Lock();
  const lock = locks[n];
  const lockcb = (key, cb) => {
    debug('Locking %s in %s locker', key, n);
    lock(key, (release) => {
      debug('Locked %s in %s locker', key, n);
      cb(undefined, () => {
        debug('Unlocking %s in %s locker', key, n);
        release(() => {
          debug('Unlocked %s in %s locker', key, n);
        })();
      });
    });
  };
  return lockcb;
};

// Export our public functions
module.exports = locker();
module.exports.locker = locker;
