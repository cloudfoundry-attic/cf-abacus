'use strict';

// Small utility that provides a subset of the PouchDB API over a set of DB
// partitions

const couchclient = require('abacus-couchclient');
const dbclient = require('..');

describe('abacus-dbclient', () => {
  it('uses the default dbclient', () => {
    expect(dbclient).to.equal(couchclient);
  });
});
