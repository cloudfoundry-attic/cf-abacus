'use strict';

// Simple function wrapper that batches Node-style calls.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');

const map = _.map;
const batch = require('..');

describe('abacus-batch', () => {
  let clock;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(Date.now(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('batches calls to functions with callbacks after a delay', (done) => {
    // Create a sum batch function
    const bsum = spy((batch, cb) =>
      cb(undefined, map(batch, (args) => [undefined, args[0] + args[1]])));
    const sum = batch.batchify(bsum, 100);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(bsum.args.length).to.equal(1);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(3);
      done1();
    });
    sum(3, 4, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(7);
      done1();
    });
    sum(5, 6, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(11);
      done1();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('reports batch errors', (done) => {
    // Create a batch function that returns an error
    const esum = new Error('oops');
    const bsum = spy((batch, cb) => cb(esum));
    const sum = batch.batchify(bsum, 100);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(bsum.args.length).to.equal(1);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal(esum);
      expect(val).to.equal(undefined);
      done1();
    });
    sum(3, 4, (err, val) => {
      expect(err).to.equal(esum);
      expect(val).to.equal(undefined);
      done1();
    });
    sum(5, 6, (err, val) => {
      expect(err).to.equal(esum);
      expect(val).to.equal(undefined);
      done1();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('reports batched call errors', (done) => {
    // Create a batch function that returns an error
    const bsum = spy((batch, cb) => cb(undefined,
      map(batch, (args) => ['err' + (args[0] + args[1]), undefined])));
    const sum = batch.batchify(bsum, 100);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(bsum.args.length).to.equal(1);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal('err3');
      expect(val).to.equal(undefined);
      done1();
    });
    sum(3, 4, (err, val) => {
      expect(err).to.equal('err7');
      expect(val).to.equal(undefined);
      done1();
    });
    sum(5, 6, (err, val) => {
      expect(err).to.equal('err11');
      expect(val).to.equal(undefined);
      done1();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('batches a number of calls to functions with callbacks', (done) => {
    // Create a sum batch function
    const bsum = spy((batch, cb) =>
      cb(undefined, map(batch, (args) => [undefined, args[0] + args[1]])));
    const sum = batch.batchify(bsum, 1000, 3);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(bsum.args.length).to.equal(1);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(3);
      done1();
    });
    sum(3, 4, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(7);
      done1();
    });
    sum(5, 6, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(11);
      done1();
    });
  });

  it('batches calls up to a max size', (done) => {
    // Create a sum batch function, this one works with strings
    const bsum = spy((batch, cb) =>
      cb(undefined, map(batch, (args) => [undefined, args[0] + args[1]])));

    // Use a call sizing function, which returns the size of the two
    // strings passed as args to the sum function
    const ssize = (name, args) => args[0].length + args[1].length;

    const sum = batch.batchify(bsum, 1000, 12, ssize);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called only once
      expect(bsum.args.length).to.equal(1);
      done();
    };

    // Call several times
    sum('ab', 'cd', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal('abcd');
      done1();
    });
    sum('ef', 'gh', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal('efgh');
      done1();
    });
    sum('ij', 'kl', (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal('ijkl');
      done1();
    });
  });

  it('groups batches of calls', (done) => {
    // Create a sum batch function
    const bsum = spy((batch, cb) =>
      cb(undefined, map(batch, (args) => [undefined, args[0] + args[1]])));

    // Group batches in two groups, depending on whether the first arg to
    // the sum function is even or odd
    const gsum = batch.groupBy(bsum, (args, cb) => cb(undefined, args[0] % 2));

    const sum = batch.batchify(gsum, 1000, 3);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called once per group
      expect(bsum.args.length).to.equal(2);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(3);
      done1();
    });
    sum(2, 4, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(6);
      done1();
    });
    sum(3, 6, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(9);
      done1();
    });
  });

  it('batches calls to generators', (done) => {
    // Create a sum batch generator
    const bsum = spy((batch, cb) => cb(undefined, map(batch, (args) => [
      undefined, args[0] + args[1]])));
    const sum = batch.batchify(yieldable(bsum), 100);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(bsum.args.length).to.equal(1);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(3);
      done1();
    });
    sum(3, 4, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(7);
      done1();
    });
    sum(5, 6, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(11);
      done1();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('converts all functions from a module', (done) => {
    // Create a sum batch function
    const bsum = spy((batch, cb) => cb(undefined, map(batch, (args) => [
      undefined, args[0] + args[1]])));
    const mod = {
      batch_sum: bsum
    };
    const b = batch.batchify(mod, 100);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(b.batch_sum.args.length).to.equal(1);
      done();
    };

    // Call several times
    b.sum(1, 2, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(3);
      done1();
    });
    b.sum(3, 4, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(7);
      done1();
    });
    b.sum(5, 6, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(11);
      done1();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('applies batches of calls to functions with callbacks', (done) => {
    // Create a sum batch function
    const sum = spy((x, y, cb) => cb(undefined, x + y));
    const bsum = batch.unbatchify(sum);

    // Call the batch function once
    bsum([
      [1, 2],
      [3, 4],
      [5, 6]
    ], (err, val) => {
      // Expect the original sum function to be called 3 times
      expect(sum.args.length).to.equal(3);
      expect(err).to.equal(undefined);

      expect(val).to.deep.equal([
        [undefined, 3],
        [undefined, 7],
        [undefined, 11]
      ]);
      done();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('applies batches of calls to generators', (done) => {
    // Create a sum batch function
    const sum = spy((x, y, cb) => {
      cb(undefined, x + y);
    });
    const bsum = batch.unbatchify(yieldable(sum));

    // Call the batch function once
    bsum([
      [1, 2],
      [3, 4],
      [5, 6]
    ], (err, val) => {
      // Expect the original sum function to be called 3 times
      expect(sum.args.length).to.equal(3);
      expect(err).to.equal(undefined);

      expect(val).to.deep.equal([
        [null, 3],
        [null, 7],
        [null, 11]
      ]);
      done();
    });

    // Run pending timers
    clock.tick(500);
  });

  it('batches and unbatches function calls', (done) => {
    // Create a sum batch function
    const sum1 = spy((x, y, cb) => cb(undefined, x + y));
    const bsum = spy(batch.unbatchify(sum1));
    const sum = batch.batchify(bsum, 100);

    let cbs = 0;
    const done1 = () => {
      if(++cbs < 3) return;
      // Expect the batch function to be called just once
      expect(bsum.args.length).to.equal(1);

      // Expect the original sum function to be called 3 times
      expect(sum1.args.length).to.equal(3);
      done();
    };

    // Call several times
    sum(1, 2, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(3);
      done1();
    });
    sum(3, 4, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(7);
      done1();
    });
    sum(5, 6, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.equal(11);
      done1();
    });

    // Run pending timers
    clock.tick(500);
  });
});

