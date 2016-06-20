'use strict';

// Small utility that distributes operations on time-based versions of keys
// over a set of partitions

const _ = require('underscore');
const sample = _.sample;
const map = _.map;
const first = _.first;
const last = _.last;
const reduce = _.reduce;
const partition = require('..');

describe('abacus-partition', () => {
  it('distributes keys over several partitions', () => {
    // Get partitions for some keys and times
    partition('Hello', Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([0, 201411]);
      });
    partition('Hey', Date.parse(
      'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([1, 201410]);
      });
    partition('Blah', Date.parse(
      'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([3, 201410]);
      });
    partition('Awwww', Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([2, 201411]);
      });
  });

  it('distributes time ranges over partition ranges', () => {
    // Get partitions for a key and a range of times
    partition('Hey', [
      Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Sat Dec 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([
        [1, 201410],
        [1, 201411],
        [1, 201412]
      ]);
    });
    partition('Blah', [
      Date.parse('Set Dec 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([
        [3, 201412],
        [3, 201411],
        [3, 201410]
      ]);
    });
  });

  it('reports forwarding and balancing errors', () => {
    // Use a custom partition function causing some errors to help test
    // error handling
    const berr = new Error('Can\'t load balance DB partition 3');
    const ferr = new Error('Can\'t forward bucket');
    const epartition = partition.partitioner(
      partition.bucket, partition.period, (b, per, rw, cb) => {
        // Cause forwarding errors on bucket 123
        const pars = [
          [Math.floor(b / 1000), Math.floor(per / 100)]
        ];
        return b === 2395 ? cb(ferr) : cb(undefined, pars);
      }, (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      });

    // Get partitions for some keys and times causing errors
    epartition('Blah', Date.parse(
      'Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(berr);
      });
    epartition('Awwww', Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(ferr);
      });
    epartition('Blah', [
      Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Sat Dec 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      expect(err).to.equal(berr);
    });
    epartition('Awwww', [
      Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Sat Dec 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      expect(err).to.equal(ferr);
    });
  });

  it('distributes sample keys evenly', () => {

    // Get partitions for the first 1000, last 1000 and a random sample of
    // 1000 keys from a set of consecutive real account keys
    const keys = require('../../src/test/keys.json');
    map([first, last, sample], (filter) => {

      // Distribute keys into partitions
      let counts = [0, 0, 0, 0];
      map(filter(keys, 1000), (k) => {
        partition(k, Date.parse(
          'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, p) => {
            // Count keys in each partition
            if(err)
              throw err;
            counts[p[0]]++;
            if(reduce(counts, (a, c) => a + c, 0) === 1000) {
              console.log('Distribution');
              // Expect 250 +- 25% keys in each partition
              map(counts, (c) => {
                const dist = (c - 250) / 250 * 100;
                console.log(dist.toFixed(2) + '%');
                expect(Math.abs(dist)).to.be.below(25);
              });
            }
          });
      });
    });
  });

  it('do not balance when the key is undefined', () => {

    const part = partition.partitioner(partition.bucket, partition.period,
      partition.forward, partition.balance, true);
    /* eslint no-unused-expressions: 1 */
    part(undefined, Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'write', (err, val) => {
        expect(err).to.be.ok;
      });

    part(undefined, Date.parse(
      'Thu Nov 06 2014 19:06:54 GMT-0800 (PST)'), 'read', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([
          [0, 201411],
          [1, 201411],
          [2, 201411],
          [3, 201411]
        ]);
      });

    part(undefined, [
      Date.parse('Mon Oct 06 2014 19:06:54 GMT-0800 (PST)'),
      Date.parse('Sat Dec 06 2014 19:06:54 GMT-0800 (PST)')
    ], 'read', (err, val) => {
      console.log('Got response', val);
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([
        [
          [0, 201410],
          [1, 201410],
          [2, 201410],
          [3, 201410]
        ],
        [
          [0, 201411],
          [1, 201411],
          [2, 201411],
          [3, 201411]
        ],
        [
          [0, 201412],
          [1, 201412],
          [2, 201412],
          [3, 201412]
        ]
      ]);
    });
  });
});
