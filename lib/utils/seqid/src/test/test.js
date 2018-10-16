'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions*/

// A function that returns sequential time-based ids.

const seqid = require('..');

describe('abacus-seqid', () => {
  let clock;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers({
      now: Date.UTC(2016, 9, 8, 7, 6, 5, 432),
      toFake: [
        'Date',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval'
      ]
    });
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('builds id properly', () => {
    const timestamp = 1446249600000;

    const id = seqid.buildId(timestamp);
    expect(id).to.match(/-0-0-0-0/);
    expect(id).to.contain(timestamp);

    const id2 = seqid.buildId(timestamp, 3);
    expect(id2).to.match(/-0-0-0-3/);
    expect(id2).to.contain(timestamp);

    let testError;
    try {
      const wrongTimestamp = 144624960000021212121212;
      seqid.buildId(wrongTimestamp);
    } catch (err) {
      testError = err;
    }
    expect(testError).to.match(/Not a timestamp/);
  });

  it('returns unique sequential ids', () => {
    // Get an id, expect the id counter to be 0
    const id1 = seqid();
    expect(id1).to.match(/-0-0-0-0/);

    // Get another for the same time, expect the id counter to increase,
    // making the id greater than the previously obtained one
    const id2 = seqid();
    expect(id2).to.match(/-0-0-0-1/);
    expect(id2 > id1).to.be.true;

    // Get an id for a later time, expect the id counter to be 0, and the
    // id to be greater than the previous one
    clock.tick(100);
    const id3 = seqid();
    expect(id3).to.match(/-0-0-0-0/);
    expect(id3 > id2).to.be.true;

    // Get an id for an earlier time (simulating clock skew), expect the
    // id time to still be the later time and the id counter to increase
    // to make the id greater than the previous one
    clock.tick(-200);
    const id4 = seqid();
    expect(id4).to.match(/-0-0-0-1/);
    expect(id4 > id3).to.be.true;
  });

  it('samples unique sequential ids', () => {
    const id = seqid();
    const t = parseInt(id);
    expect(seqid.sample(undefined)).to.equal(undefined);
    expect(seqid.sample(id)).to.equal(id);
    expect(seqid.sample(id, 1)).to.equal('000' + t);
    expect(seqid.sample(id, 3600000)).to.equal('000' + Math.floor(t / 3600000) * 3600000);
    expect(seqid.sample(id, '180s')).to.equal('000' + Math.floor(t / 180000) * 180000);
    expect(seqid.sample(id, 's')).to.equal('000' + Math.floor(t / 1000) * 1000);
    expect(seqid.sample(id, '15m')).to.equal('000' + Math.floor(t / 900000) * 900000);
    expect(seqid.sample(id, 'm')).to.equal('000' + Math.floor(t / 60000) * 60000);
    expect(seqid.sample(id, '2h')).to.equal('000' + Math.floor(t / 7200000) * 7200000);
    expect(seqid.sample(id, 'h')).to.equal('000' + Math.floor(t / 3600000) * 3600000);
    expect(seqid.sample(id, '5D')).to.equal('000' + Math.floor(t / 432000000) * 432000000);
    expect(seqid.sample(id, 'D')).to.equal('000' + Math.floor(t / 86400000) * 86400000);
    expect(seqid.sample(id, '2M')).to.equal('000' + Date.UTC(2016, 8));
    expect(seqid.sample(id, 'M')).to.equal('000' + Date.UTC(2016, 9));
    const fn = () => seqid.sample(id, 'Y');
    expect(fn).to.throw();
  });
});
