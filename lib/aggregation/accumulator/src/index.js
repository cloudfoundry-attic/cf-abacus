'use strict';

const { extend, filter, indexOf, omit, map, times } = require('underscore');

const cluster = require('abacus-cluster');
const dataflow = require('abacus-dataflow');
const lrucache = require('abacus-lrucache');
const mconfigcb = require('abacus-metering-config');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const router = require('abacus-router');

const timewindow = require('abacus-timewindow');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');
const webapp = require('abacus-webapp');

const { reducerConfig } = require('./lib/reducer-config');

const mconfig = yieldable(mconfigcb);

/* eslint camelcase: 1 */

const windowsSizes = process.env.TIME_WINDOWS_SIZES ? JSON.parse(process.env.TIME_WINDOWS_SIZES) : undefined;

const createTimeWindows = timewindow.timeWindowsSizes;

const dimension = timewindow.dimension;

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () =>
  /^[0-9]+[MDhms]$/.test(process.env.SLACK)
    ? {
      scale: process.env.SLACK.charAt(process.env.SLACK.length - 1),
      width: process.env.SLACK.match(/[0-9]+/)[0]
    }
    : {
      scale: dimension.min,
      width: 10
    };

const timeWindows = createTimeWindows(slack(), windowsSizes);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-accumulator');
const edebug = require('abacus-debug')('e-abacus-usage-accumulator');

let systemToken;

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// Configure reduction result doc sampling, to store reduction results
// in a single doc per min, hour or day for example instead of creating
// a new doc for each new result
const sampling = process.env.SAMPLING;


// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  aggregator: 9300
});

const dimensions = timewindow.dimensions;

// Millisecond representation of the time dimensions
const msDimensions = {
  M: 2678400000,
  D: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000
};

// Return the accumulate function for a given metric
const accumfn = (metrics, metric) => filter(metrics, (m) => m.name === metric)[0].accumulatefn;

const maxAge = process.env.RESULTS_CACHE_MAX_AGE ? parseInt(process.env.RESULTS_CACHE_MAX_AGE) : 120000;

const lruOpts = {
  max: 100,
  maxAge: maxAge
};

const functionCache = lrucache(lruOpts);

const accumulateHashFunction = (accumulator, quantity, start, end, from, to, twCell) =>
  `${JSON.stringify(accumulator)}${JSON.stringify(quantity)}${start}${end}${from}${to}`;

const accumulationFunction = (meteringPlanId, metrics, metricName) => {
  const accumulationFnKey = `${meteringPlanId}${metricName}accumFn`;

  let accumulationFn = functionCache.get(accumulationFnKey);
  if (!accumulationFn) {
    accumulationFn = lrucache.memoize(accumfn(metrics, metricName), accumulateHashFunction, lruOpts);
    functionCache.set(accumulationFnKey, accumulationFn);
  }
  return accumulationFn;
};

// Return the accumulated usage windows for a given metric
const accum = (accumulatedUsage, metric) => {
  const a = filter(accumulatedUsage, (a) => a.metric === metric);
  return a.length
    ? a[0].windows
    : [
      timeWindows.getWindows(dimension.sec),
      timeWindows.getWindows(dimension.min),
      timeWindows.getWindows(dimension.hour),
      timeWindows.getWindows(dimension.day),
      timeWindows.getWindows(dimension.month)
    ];
};

// Accumulate usage and return new accumulated value
const accumulate = function*(accums, usage) {
  debug('Accumulating usage %o from %d and new usage %o from %d',
    accums[0], accums[0] ? accums[0].end : 0, usage, usage.end);

  // Accumulate new usage into the first of the set of output docs
  // produced at each reduction iteration
  const a = accums[0];

  // Even a millisecond difference could have the usage misplaced in the windows
  // Use time from processed_id
  const now = parseInt(usage.processed_id);

  const slackLimit = msDimensions[slack().scale] * slack().width;
  const lastMonth = moment.utc().subtract(1, 'month').endOf('month');
  const slackTimeout = moment.utc().startOf('month').add(slackLimit, 'milliseconds');
  if (usage.end <= lastMonth.valueOf() && now > slackTimeout.valueOf()) {
    const msg = 'Last month slack window ended on ' + slackTimeout.toString();
    throw extend(new Error(msg), {
      status: 409,
      error: 'slack',
      reason: msg,
      noretry: true,
      nobreaker: true
    });
  }

  const meteringPlanId = usage.metering_plan_id;

  // Retrieve the metering plan and rating plan
  const mplan = yield mconfig(meteringPlanId, systemToken && systemToken());

  const e = mplan.error;
  if (e) {
    debug('The usage submitted has business errors %o', e);
    return [extend({}, usage, mplan)];
  }

  // Compute the accumulated usage time and new usage time
  const processed = a ? a.processed : 0;

  // Use previous accumulated value if any
  const umerge = omit(usage, 'id', 'metrics', 'metered_usage', 'measured_usage');
  const amerge = a
    ? extend({}, a, umerge)
    : extend({ accumulated_usage: [] }, umerge);

  // Calculate new accumulated usage
  const newa = extend({}, amerge, {
    accumulated_usage: map(usage.metered_usage, (meteredUsage) => {
      debug('Accumulating metered usage quantity %o', meteredUsage);
      const metricName = meteredUsage.metric;
      const accumulateFn = accumulationFunction(meteringPlanId, mplan.metering_plan.metrics, metricName);
      const accumulateWindow = accum(amerge.accumulated_usage, meteredUsage.metric);

      // a function that gives the value of the submitted usage in the
      // dimension window.
      const getCell = timewindow.cellfn(accumulateWindow, now, usage.end);

      return {
        metric: meteredUsage.metric,
        windows: map(accumulateWindow, (window, i) => {
          if (!timewindow.isDimensionSupported(dimensions[i]))
            return [null];

          // Get the appropriate time window index
          const twi = timewindow.timeWindowIndex(window, now, usage.end, dimensions[i], true);

          // Expand the time windows if necessary
          if (i >= indexOf(dimensions, slack().scale) && window.length - 1 < twi)
            times(twi - window.length + 1, () => window.push(null));

          // Shift the windows if now is part of a new time window
          if (a && now > processed) timewindow.shiftWindow(a.processed, now, window, dimensions[i]);

          /* eslint complexity: [1, 6] */
          return map(window, (timeWindow, j) => {
            const bounds = timewindow.timeWindowBounds(now, dimensions[i], -j);
            const current = timeWindow && timeWindow.quantity
              && timeWindow.quantity.current ? timeWindow.quantity.current : 0;
            const accumulated = accumulateFn(
              current,
              meteredUsage.quantity,
              usage.start,
              usage.end,
              bounds.from,
              bounds.to,
              getCell
            );

            // Do not accumulate if the function returns null
            if (accumulated === null) {
              debug('No accumulation in window %d index %d', i, j);
              return timeWindow ? extend({}, timeWindow) : null;
            }

            // Switch old current to previous in previously accumulated windows
            if (timeWindow && timeWindow.quantity && timeWindow.quantity.current) {
              debug('Accumulating window %d index %d new quantity %o old quantity %o', i, j, timeWindow, meteredUsage);
              return {
                quantity: {
                  previous: timeWindow.quantity.current,
                  current: accumulated
                }
              };
            }

            // Create a new accumulated object at the window
            debug('New window %d index %d new quantity %o', i, j, timeWindow);
            return {
              quantity: {
                current: accumulated
              }
            };
          });
        })
      };
    })
  });

  // Return new accumulated usage and an empty doc used for duplicate
  // usage detection
  debug('New accumulated usage %o', newa);
  return [newa, {}];
};

// Create an accumulator service app
const accumulator = (token) => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured()) app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const reducer = dataflow.reducer(accumulate, reducerConfig(secured, sampling, token));

  app.use(reducer);
  app.use(router.batch(app));

  app.reducer = reducer;
  return app;
};

const startApp = (token) => {
  const app = accumulator(token);
  app.listen();

  if (!cluster.isWorker() || cluster.isDisabled()) {
    debug('Starting replay ...');
    dataflow.replay(app.reducer, 0, (err) => {
      if (err) edebug('Replay failed with error %o', err);
      else debug('Replay completed successfully');
    });
  }
};

const runCLI = () => {
  if (secured()) {
    systemToken = oauth.cache(
      uris.auth_server,
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      'abacus.usage.write abacus.usage.read'
    );

    systemToken.start((err) => {
      if (err) edebug('Unable to obtain oAuth token due to %o', err);
      else startApp(systemToken);
    });
  } else startApp();
};

// Export our public functions
module.exports = accumulator;
module.exports.accumulate = accumulate;
module.exports.runCLI = runCLI;
