'use strict';

const couchclient = require('abacus-couchclient');
const dbclient = require('..');

describe('abacus-dbclient', () => {

  it('uses the default dbclient', function() {
    if (process.env.DBCLIENT) {
      console.log('  DBCLIENT set to', process.env.DBCLIENT);
      this.skip();
    }

    expect(dbclient).to.equal(couchclient);
  });

});
