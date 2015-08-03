'use strict';

// Name and partitioning scheme for the metering dbs.

const db = require('..');

describe('abacus-metering-db', () => {
    it('distributes keys over several partitions', () => {
        // Get partitions for some keys and times
        const p = db.partition(4);
        p('Hello', Date.parse('Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal([0, 201411]);
        });
        p('Hey', Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal([1, 201410]);
        });
        p('Blah', Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal([3, 201410]);
        });
        p('Awwww', Date.parse('Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal([2, 201411]);
        });
    });

    it('distributes time ranges over partition ranges', () => {
        // Get partitions for a key and a range of times
        const p = db.partition(4);
        p('Hey', [Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), Date.parse('Sat Dec 06 2014 19:06:54 GMT-0800 (PST)')], 'read', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal([[1, 201410], [1, 201411], [1, 201412]]);
        });
        p('Blah', [Date.parse('Set Dec 06 2014 19:06:54 GMT-0800 (PST)'), Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')], 'read', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal([[3, 201412], [3, 201411], [3, 201410]]);
        });
    });

});

