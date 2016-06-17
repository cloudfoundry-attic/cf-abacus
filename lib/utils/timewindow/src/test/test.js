'use strict';

// Time window utilities

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
    
    // Try month window that allows exceeding the window length
    date = new Date(Date.UTC(2015, 0, 23));
    expect(time.timeWindowIndex(win, now, date, 'M', true)).to.equal(14);

    // Try week window
    date = new Date(Date.UTC(2016, 2, 7));
    expect(time.timeWindowIndex(win, now, date, 'W')).to.equal(0);
    date = new Date(Date.UTC(2016, 2, 5));
    expect(time.timeWindowIndex(win, now, date, 'W')).to.equal(1);
    date = new Date(Date.UTC(2016, 1, 26));
    expect(time.timeWindowIndex(win, now, date, 'W')).to.equal(2);

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

  it('Shift a time window', () => {
    let win;
    let date;

    const now = new Date(Date.UTC(2016, 2, 10, 12, 1, 30));

    // Try month window
    win = [1, 2, 3];
    date = new Date(Date.UTC(2016, 1, 27));
    time.shiftWindow(date, now, win, 'M');
    expect(win).to.deep.equal([null, 1, 2]);

    // Try a month window with a larger difference than the window length
    date = new Date(Date.UTC(2015, 0, 23));
    win = [1, 2, 3];
    time.shiftWindow(date, now, win, 'M');
    expect(win).to.deep.equal([null, null, null]);

    // Try date window
    date = new Date(Date.UTC(2016, 2, 8, 23, 23, 23));
    win = [1, 2, 3];
    time.shiftWindow(date, now, win, 'D');
    expect(win).to.deep.equal([null, null, 1]);

    // Try hour window
    date = new Date(Date.UTC(2016, 2, 10, 12, 23, 23));
    win = [1, 2, 3];
    time.shiftWindow(date, now, win, 'h');
    expect(win).to.deep.equal([1, 2, 3]);

    // Try minute window
    date = new Date(Date.UTC(2016, 2, 10, 11, 59, 23));
    win = [1, 2, 3];
    time.shiftWindow(date, now, win, 'm');
    expect(win).to.deep.equal([null, null, 1]);

    // Try second window
    date = new Date(Date.UTC(2016, 2, 10, 12, 1, 27));
    win = [1, 2, 3];
    time.shiftWindow(date, now, win, 's');
    expect(win).to.deep.equal([null, null, null]);
  });

  it('calculate the bounds of a window', () => {
    const date = new Date(Date.UTC(2016, 1, 23, 23, 23, 23, 23));

    // Try month window
    let from = new Date(Date.UTC(2016, 1));
    let to = new Date(Date.UTC(2016, 2));
    expect(time.timeWindowBounds(date, 'M')).to.deep.equal({
      from: from,
      to: to
    });

    // Try month window with a shift
    from = new Date(Date.UTC(2016, 0));
    to = new Date(Date.UTC(2016, 1));
    expect(time.timeWindowBounds(date, 'M', -1)).to.deep.equal({
      from: from,
      to: to
    });

    // Try date window
    from = new Date(Date.UTC(2016, 1, 23));
    to = new Date(Date.UTC(2016, 1, 24));
    expect(time.timeWindowBounds(date, 'D')).to.deep.equal({
      from: from,
      to: to
    });

    // Try hour window
    from = new Date(Date.UTC(2016, 1, 23, 23));
    to = new Date(Date.UTC(2016, 1, 23, 24));
    expect(time.timeWindowBounds(date, 'h')).to.deep.equal({
      from: from,
      to: to
    });

    // Try minute window
    from = new Date(Date.UTC(2016, 1, 23, 23, 23));
    to = new Date(Date.UTC(2016, 1, 23, 23, 24));
    expect(time.timeWindowBounds(date, 'm')).to.deep.equal({
      from: from,
      to: to
    });

    // Try second window
    from = new Date(Date.UTC(2016, 1, 23, 23, 23, 23));
    to = new Date(Date.UTC(2016, 1, 23, 23, 23, 24));
    expect(time.timeWindowBounds(date, 's')).to.deep.equal({
      from: from,
      to: to
    });
  });

  it('provides get cell function', () => {
    const June7th = 1465282800001;
    const June8th = 1465369200001;

    // Slack set to 2D. processed June8th, doc is at June7th
    let cellfn = time.cellfn([[null],
      [null],
      [null],
      [{ quantity: 5 }, { quantity: 25 }],
      [{ quantity: 30 }, null]], June8th, June7th);

    
    expect(cellfn('s')).to.equal(undefined);
    expect(cellfn('m')).to.equal(undefined);
    expect(cellfn('h')).to.equal(undefined);
    expect(cellfn('D')).to.equal(25);
    expect(cellfn('M')).to.equal(30);

    // Slack set to 2D. processed June8th, doc is at June8th
    cellfn = time.cellfn([[null],
      [null],
      [null],
      [{ quantity: 5 }, { quantity: 25 }],
      [{ quantity: 30 }, null]], June8th, June8th);

    expect(cellfn('s')).to.equal(null);
    expect(cellfn('m')).to.equal(null);
    expect(cellfn('h')).to.equal(null);
    expect(cellfn('D')).to.equal(5);
    expect(cellfn('M')).to.equal(30);
  });
});

