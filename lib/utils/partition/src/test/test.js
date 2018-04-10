'use strict';

// Small utility that distributes operations on time-based versions of keys
// over a set of partitions

const moment = require('abacus-moment');

const _ = require('underscore');
const sample = _.sample;
const map = _.map;
const first = _.first;
const last = _.last;
const reduce = _.reduce;
const partition = require('..');

// Setup debug log
const debug = require('abacus-debug')('abacus-partition-test');

describe('abacus-partition', () => {
  it('distributes keys over several partitions', () => {
    // Get partitions for some keys and times
    partition('Hello', moment.utc('2014-11-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([0, 201411]);
    });
    partition('Hey', moment.utc('2014-10-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([1, 201410]);
    });
    partition('Blah', moment.utc('2014-10-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([3, 201410]);
    });
    partition('Awwww', moment.utc('2014-11-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([2, 201411]);
    });
  });

  it('distributes time ranges over partition ranges', () => {
    // Get partitions for a key and a range of times
    partition(
      'Hey',
      [moment.utc('2014-10-06 19:06:54').valueOf(), moment.utc('2014-12-06 19:06:54').valueOf()],
      'read',
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([[1, 201410], [1, 201411], [1, 201412]]);
      }
    );
    partition(
      'Blah',
      [moment.utc('2014-12-06 19:06:54').valueOf(), moment.utc('2014-10-06 19:06:54').valueOf()],
      'read',
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([[3, 201412], [3, 201411], [3, 201410]]);
      }
    );
  });

  it('reports forwarding and balancing errors', () => {
    // Use a custom partition function causing some errors to help test
    // error handling
    const berr = new Error('Can\'t load balance DB partition 3');
    const ferr = new Error('Can\'t forward bucket');
    const epartition = partition.partitioner(
      partition.bucket,
      partition.period,
      (b, per, rw, cb) => {
        // Cause forwarding errors on bucket 123
        const pars = [[Math.floor(b / 1000), Math.floor(per / 100)]];
        return b === 2395 ? cb(ferr) : cb(undefined, pars);
      },
      (p, o, cb) => {
        // Cause load balancing errors on DB partition 3
        return p[0][0] === 3 ? cb(berr) : cb(undefined, sample(p));
      }
    );

    // Get partitions for some keys and times causing errors
    epartition('Blah', moment.utc('2014-10-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(berr);
    });
    epartition('Awwww', moment.utc('2014-11-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(ferr);
    });
    epartition(
      'Blah',
      [moment.utc('2014-10-06 19:06:54').valueOf(), moment.utc('2014-12-06 19:06:54').valueOf()],
      'read',
      (err, val) => {
        expect(err).to.equal(berr);
      }
    );
    epartition(
      'Awwww',
      [moment.utc('2014-10-06 19:06:54').valueOf(), moment.utc('2014-12-06 19:06:54').valueOf()],
      'read',
      (err, val) => {
        expect(err).to.equal(ferr);
      }
    );
  });

  // Get partitions for the first 1000, last 1000 and a random sample of
  // 1000 keys from a set of consecutive real account keys
  context('distributes sample keys evenly', () => {
    const timeInMs = moment.utc('2014-11-06 19:06:54').valueOf();

    // Distribute keys into partitions
    const distribute = (fn, timeFn, keys, numKeys, numPartitions, numBuckets) => {
      const counts = Array.apply(null, { length: numPartitions });
      counts.fill(0);

      const idealDistKeys = numKeys / counts.length;
      const errorPercentage = 25;

      const partitionFn = partition.partitioner(
        partition.bucket,
        partition.period,
        partition.createForwardFn(numPartitions, numBuckets),
        partition.balance
      );

      map(fn(keys, numKeys), (k) => {
        const time = timeFn();
        partitionFn(k, time, 'read', (err, p) => {
          // Count keys in each partition
          if (err) throw err;
          counts[p[0]]++;

          if (reduce(counts, (a, c) => a + c, 0) === numKeys) {
            debug('Key counts %o; max error %d %%; Distribution distance:', counts, errorPercentage);
            // Expect keysInPartition +- errorPercentage keys
            // in each partition
            map(counts, (count) => {
              const distance = (count - idealDistKeys) / idealDistKeys * 100;
              debug(distance.toFixed(2) + '%');
              expect(Math.abs(distance)).to.be.below(errorPercentage);
            });
          }
        });
      });
    };

    const test = (timeFn, keys, numPartitions, numBuckets) => {
      it('first 1000 keys', () => {
        distribute(first, timeFn, keys, 1000, numPartitions, numBuckets);
      });

      it('last 1000 keys', () => {
        distribute(last, timeFn, keys, 1000, numPartitions, numBuckets);
      });

      it('sample of 1000 keys', () => {
        distribute(sample, timeFn, keys, 1000, numPartitions, numBuckets);
      });
    };

    context('4 partitions with 4000 buckets', () => {
      const keys = require('../../src/test/keys.json');

      context('with fixed time', () => {
        const defaultTimeFn = () => timeInMs;

        test(defaultTimeFn, keys, 4, 4000);
      });

      context('with close time-range', () => {
        const low = timeInMs - 20000;
        const high = timeInMs + 20000;
        const timeFn = () => Math.random() * (high - low) + low;

        test(timeFn, keys, 4, 4000);
      });

      context('with wide time-range', () => {
        const low = moment
          .utc(timeInMs)
          .subtract(50, 'year')
          .valueOf();
        const high = moment
          .utc(timeInMs)
          .add(50, 'year')
          .valueOf();
        const timeFn = () => Math.random() * (high - low) + low;

        test(timeFn, keys, 4, 4000);
      });
    });

    context('6 partitions with 4000 buckets', () => {
      const keys = require('../../src/test/keys.json');

      context('with fixed time', () => {
        const defaultTimeFn = () => timeInMs;

        test(defaultTimeFn, keys, 6, 4000);
      });

      context('with close time-range', () => {
        const low = timeInMs - 20000;
        const high = timeInMs + 20000;
        const timeFn = () => Math.random() * (high - low) + low;

        test(timeFn, keys, 6, 4000);
      });

      context('with wide time-range', () => {
        const low = moment
          .utc(timeInMs)
          .subtract(50, 'year')
          .valueOf();
        const high = moment
          .utc(timeInMs)
          .add(50, 'year')
          .valueOf();
        const timeFn = () => Math.random() * (high - low) + low;

        test(timeFn, keys, 6, 4000);
      });
    });
  });

  it('do not balance when the key is undefined', () => {
    const part = partition.partitioner(partition.bucket, partition.period, partition.forward, partition.balance, true);
    /* eslint no-unused-expressions: 1 */
    part(undefined, moment.utc('2014-11-06 19:06:54').valueOf(), 'write', (err, val) => {
      expect(err).to.be.ok;
    });

    part(undefined, moment.utc('2014-11-06 19:06:54').valueOf(), 'read', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal([[0, 201411], [1, 201411], [2, 201411], [3, 201411]]);
    });

    part(
      undefined,
      [moment.utc('2014-10-06 19:06:54').valueOf(), moment.utc('2014-12-06 19:06:54').valueOf()],
      'read',
      (err, val) => {
        debug('Got response %o', val);
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal([
          [[0, 201410], [1, 201410], [2, 201410], [3, 201410]],
          [[0, 201411], [1, 201411], [2, 201411], [3, 201411]],
          [[0, 201412], [1, 201412], [2, 201412], [3, 201412]]
        ]);
      }
    );
  });
});
