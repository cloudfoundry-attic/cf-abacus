'use strict';

// Deep copies an object/array

const time = require('..');

describe('abacus-timewindow', () => {
  it('Calculate the index of a time window', () => {
    const win = [null, null, null, null, null];

    // Set current time to 2016-03-10:12:01:30 UTC
    const now = new Date(Date.UTC(2016, 2, 10, 12, 1, 30));

    // Try month window
    let date = new Date(Date.UTC(2016, 1, 27));
    expect(time.timeWindowIndex(win, now, date, 'M')).to.equal(1);

    // Try a month window with a larger difference than the window length
    date = new Date(Date.UTC(2015, 0, 23));
    expect(time.timeWindowIndex(win, now, date, 'M')).to.equal(-1);

    // Try date window
    date = new Date(Date.UTC(2016, 2, 7, 23, 23, 23));
    expect(time.timeWindowIndex(win, now, date, 'D')).to.equal(3);

    // Try hour window
    date = new Date(Date.UTC(2016, 2, 10, 10, 23, 23));
    expect(time.timeWindowIndex(win, now, date, 'h')).to.equal(2);

    // Try minute window
    date = new Date(Date.UTC(2016, 2, 10, 11, 59, 23));
    expect(time.timeWindowIndex(win, now, date, 'm')).to.equal(2);

    // Try second window
    date = new Date(Date.UTC(2016, 2, 10, 12, 1, 26));
    expect(time.timeWindowIndex(win, now, date, 's')).to.equal(4);
  });
});

