'use strict';

// A mini wrapper around the lock module that makes it a bit easier to use.

/* eslint no-unused-expressions: 1 */

const lock = require('..');

describe('abacus-lock', () => {
  it('Multiple locks with same keys', (done) => {
    let unlock1 = undefined;
    let unlock2 = undefined;
    const locker2 = lock.locker('Locker 2');
    setTimeout(() => {
      expect(unlock1).to.be.ok;
      unlock1();
      expect(unlock2).to.be.ok;
      unlock2();
      done();
    }, 1);
    lock('key', (e, u) => {
      unlock1 = u;
    });
    locker2('key', (e, u) => {
      unlock2 = u;
    });
  });
});
