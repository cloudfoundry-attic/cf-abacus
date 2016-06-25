'use strict';

// A function that returns sequential time-based ids.

const seqid = require('..');

describe('abacus-seqid', () => {
  let clock;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(new Date('2016-01-01').getTime(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('returns unique sequential ids', () => {
    // Get an id, expect the id counter to be 0
    const id1 = seqid();
    expect(id1).to.match(/-0-0-0-0/);

    // Get another for the same time, expect the id counter to increase,
    // making the id greater than the previously obtained one
    const id2 = seqid();
    expect(id2).to.match(/-0-0-0-1/);
    expect(id2).to.be.above(id1);

    // Get an id for a later time, expect the id counter to be 0, and the
    // id to be greater than the previous one
    clock.tick(100);
    const id3 = seqid();
    expect(id3).to.match(/-0-0-0-0/);
    expect(id3).to.be.above(id2);

    // Get an id for an earlier time (simulating clock skew), expect the
    // id time to still be the later time and the id counter to increase
    // to make the id greater than the previous one
    clock.tick(-200);
    const id4 = seqid();
    expect(id4).to.match(/-0-0-0-1/);
    expect(id4).to.be.above(id3);
  });

  it('samples unique sequential ids', () => {
    const id = seqid();
    const fid = seqid.sample(id, 3600000);
    expect(fid).to.equal('0001451606400000-0-0-0-0');
  });
});

