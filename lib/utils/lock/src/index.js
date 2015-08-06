'use strict';

// A mini wrapper around the lock module that makes it a bit easier to use.

const lock = require('lock')();

// Setup debug log
const debug = require('abacus-debug')('abacus-lock');

// A version of lock that uses a proper Node style callback, and passes
// to the callback a function that can be called to unlock.
const lockcb = (key, cb) => {
  debug('Locking %s', key);
  lock(key, (release) => {
    debug('Locked %s', key);
    cb(undefined, () => {
      debug('Unlocking %s', key);
      release(() => {
        debug('Unlocked %s', key);
      })();
    });
  });
};

// Export our public functions
module.exports = lockcb;

