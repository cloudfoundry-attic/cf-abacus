abacus-perf
===

Collect real time function call perf and reliability metrics.

This module provides a way to collect function call performance and reliability
metrics and compute real time stats on these metrics. The stats are computed
using rolling windows of call successes, failures, timeouts, circuit breaker
rejections and latencies.

## require('abacus-perf')

### perf.report(...)  &&  perf.healthy()

Collects real time function call performace and reliability metrics, computes real time stats on these metrics. 
The stats are computed using rolling windows of call successes, failures, timeouts, rejections and latencies.

The api this library provites is the following:
 - `perf.report(name, time, latency, err, timeout, reject, circuit)`
   - `name` is the name of the metric for which you want to report status (_required_)
   - `time` is the time of the occurance (_not mandatory_)
   - `latency` (_not mandatory_)
   - `err`  Object of type error. _If provided, perf will treat this report as failing_
   - `timeout` _If provided, perf will treat this report as failing_
   - `reject`  _If provided, perf will treat this report as failing_
   - `circuit` (_not mandatory_)


A little demo of how can you report custom metrics:
```js
const perf = require('abacus-perf');
const moment = require('abacus-moment');
const now = moment.now();

// Report a healthy metric named 'my.custom.metric'
perf.report('my.custom.metric', now);

perf.healthy();                   // True

// Report Error 1 second after the success
perf.report('my.custom.metric', now + 1000, undefined, new Error());

perf.healthy();                   // False
```

The second healthy check is negative, since we have sent one positive and one negative report for our metric.
Which is 50% failure rate in the last 10 seconds, and the perf module by default reports unhealthy if we have 
more than 5% failure. You can pass another value to `perf.healthy()` if you want to change the treshold:

```js
perf.healthy(51);                 // True
```

Note that the function healthy will calculate the % faliure 
based on the metrics recieved in the last 10 seconds (by default) from the last recieved metric.

It will reroll everytime you sent new metric.

```js
// Send successfull metric 30 seconds later
perf.report('my.custom.metric', now + 30000);
 
perf.healthy();                   // True
```
Now we are healthy because in the last 10 seconds we have only one report - successfull => 0% faliure.

### perf.rollCounts(...)
This is the function that rerolls all the buckets on call of `perf.report(...)` and descides which make it to the current time window and which are out of date (droped). 

Relies on `perf.roll(...)` which implements the rolling time window algorithm.

### perf.roll(...)
Convert a list of buckets to a list of buckets in a rolling time window.
Filter out the buckets that are out of the time window, and create a new
bucket if necessary for the given time.

## Configuration of tracked time window
By default `perf` module keeps track on reported metrics within the last 10 seconds. This befaviour could be changed by providing additional configuration using `PERF_COUNT_SAMPLE` enviornment variable.
The enviornment variable has the following format
```
PERF_COUNT_SAMPLE = '{ "granularity": "seconds", "size": 10 }'
```

The attributes have the following semantics
 - `granularity` - specifies the time dimension that is used to define the time window size. Accepted values are `seconds`, `minutes` and `hours`.
 - `size` - specifies the size of the time window. Accepted values are valid integers

 <blockquote>
  Please note that specifying certain granularity will reduce the `perf` resultion to this dimension. For instance specifying `hours` will result in metrics' timestamp to be rounded to an hour level. Having this in mind, window sample of `1 hour` and `60 minutes` is not quite the same. 
</blockquote>
