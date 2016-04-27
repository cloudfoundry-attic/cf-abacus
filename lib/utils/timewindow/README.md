abacus-timewindow
===

Utilities for dealing with time windows.

A time window in this context is defined as a range of time covering the
boundaries of a specific time to a specific time dimension. For example,
[2015-01-01T00:30:00.000Z, 2015-01-01T00:31:00.000Z] would be a time window
of January 1, 2015 at 12:30 A.M.

abacus-timewindow works with UTC time. It works in the dimensions of a
second, minute, hour, day, and month. The notation for these is as follows:
```
[M = month, W = week, D = day, h = hour, m = minute, s = second]
```

Calculating the number of time windows between two dates
---
abacus-timewindow allows calculating the difference in number of time
windows between two dates of a given dimension. For example, calculating
the number of monthly time windows between 2016-01 and 2015-09 would result
in 4.

```javascript
// Results in 4
timewindow.diff(new Date(Date.UTC(2015, 8)),
  new Date(Date.UTC(2016, 0)), 'M');

// Results in 6
timewindow.diff(new Date(Date.UTC(2016, 0, 1)),
  new Date(Date.UTC(2016, 0, 7)), 'D');

// Results in 13
timewindow.diff(new Date(Date.UTC(2016, 0, 1, 10)),
  new Date(Date.UTC(2016, 0, 1, 23)), 'h');

// Results in 23
timewindow.diff(new Date(Date.UTC(2016, 0, 1, 0, 23)),
  new Date(Date.UTC(2016, 0, 1, 0, 46)), 'm');

// Results in 35
timewindow.diff(new Date(Date.UTC(2016, 0, 1, 0, 0, 20)),
  new Date(Date.UTC(2016, 0, 1, 0, 0, 55)), 's');
```

"Flattening" a date
---
abacus-timewindow can "flatten" or "zero" out a given date to a single
time dimensions. This means that with any given date and dimension,
the date will have all values in dimensions lower that the specified one
set to zero.

```javascript
// Returns 2015-05-01, at 00:00:00.000Z time
timewindow.zeroLowerTimeDimensions(new Date(Date.UTC(2015, 4, 20, 5, 40)), 'M');
```

Calculating the time window bounds of a date
---
abacus-timewindow can also calculate the beginning and ending bounds of the
time window containing the given date to a specified dimension.

```javascript
// Returns from = 2015-04-20 and to = 2015-04-21 with both at 00:00:00:000Z
timewindow.timeWindowBounds(new Date(Date.UTC(2015, 3, 20, 3, 20, 20)), 'D');

// Shifts the boundary calculations by -5 days
// Returns from = 2015-04-15 and to = 2015-04-16 with both at 00:00:00:000Z
timewindow.timeWindowBounds(new Date(Date.UTC(2015, 3, 20, 3, 20, 20)), 'D', -5);
```
