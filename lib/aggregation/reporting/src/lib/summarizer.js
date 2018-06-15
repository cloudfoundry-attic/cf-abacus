'use strict';

const { extend, each, filter, map } = require('underscore');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const mconfigcb = require('abacus-metering-config');
const { memoize } = require('abacus-lrucache');
const moment = require('abacus-moment');
const timewindow = require('abacus-timewindow');
const tmap = require('abacus-transform').map;
const yieldable = require('abacus-yieldable');

const mconfig = yieldable(mconfigcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');
const edebug = require('abacus-debug')('e-abacus-usage-reporting');
const pdebug = require('abacus-debug')('p-abacus-usage-reporting');

// Get metering plan
const getMeteringPlan = function*(id, auth) {
  debug('Getting metering plan with id %s', id);
  const mplan = yield mconfig(id, auth);
  debug('Got metering plan %o', mplan);

  // Error when getting metering plan
  if (mplan.error) {
    debug('Error when getting metering plan %s: %s', id, mplan.reason);
    throw extend({ statusCode: 200 }, mplan);
  }

  return mplan.metering_plan;
};

const maxAge = process.env.RESULTS_CACHE_MAX_AGE ? parseInt(process.env.RESULTS_CACHE_MAX_AGE) : 300000;

const lruOpts = {
  max: 500,
  maxAge: maxAge
};

const hashFunction = (t, values, from, to) =>
  `${t}${JSON.stringify(values)}` + `${moment.utc(from).valueOf()}${moment.utc(to).valueOf()}`;

const functionMemoizer = (key, fn) => fn ? memoize(fn, hashFunction, lruOpts) : undefined;

const transformMapCb = (err, resource, accumulatedResult, cb) => {
  if (err) {
    cb(err);
    return;
  }

  cb(undefined, extend({}, resource, accumulatedResult));
};

// Traverse and calculate every single window + slack
const traverseWindows = (metric, processed, time, processFn, summarizeFn) =>
  extend({}, metric, {
    windows: map(metric.windows, (window, windowIndex) =>
      map(window, (windowElement, windowElementIndex) => {
        // Calculate the from and to bounds of the window
        const bounds = timewindow.timeWindowBounds(processed, timewindow.dimensions[windowIndex], -windowElementIndex);
        return processFn(metric, windowElement, summarizeFn, time, bounds);
      })
    )
  });

// Return the summarize function for a given metric
const summarizefn = (planId, metrics, metricName) => {
  const metric = filter(metrics, (m) => m.name === metricName)[0];
  if (!metric) {
    edebug('Plan change detected: metric %s missing from plan %s', metricName, planId);
    return () => 0;
  }
  return metric.summarizefn;
};

// Clone the metric and extend with a usage summary
// returns the result from summarize or null if sfn is undefined
const summarizeWindowElement = (metric, windowElement, summaryFn, time, bounds) => {
  if (!windowElement)
    return null;
  if (!summaryFn)
    return extend({}, windowElement);

  try {
    return extend({}, windowElement, { summary: summaryFn(time, windowElement.quantity, bounds.from, bounds.to) });
  } catch (err) {
    edebug(`Failed to calculate summarize for metric ${metric}: %o`, err);
    return extend({}, windowElement, { summary: 0 });
  }
};

const summarizeMetric = (planId, metrics, fnMemoizer, summarizePlanFn) => (metric, i, l, cb) => {
  setImmediate(() => {
    const summarizeFunction = fnMemoizer(
      planId + metric.metric,
      summarizefn(planId, metrics, metric.metric)
    );

    try {
      debug(`Summarizing metric %o for plan ${planId}`, metric);
      cb(undefined, summarizePlanFn(metric, summarizeFunction));
    } catch (err) {
      edebug(`Failed to calculate summarize for plan ${planId}, metric ${metric.metric}: %o`, err);
      cb(err);
    }
  });
};

const summarizer = (time, aggregatedUsage, auth, counter) => {
  const summarizeFunctionMemoizer = memoize(functionMemoizer, (key) => key, lruOpts);
  const uniquePlanIds = new Set();

  // Calculates the summary for a metric under a plan, given the
  // metric object, query time, usage processed time, summarize function
  const summarizePlanMetric = (metric, sfn) => {
    const summarizedMetric = traverseWindows(metric, aggregatedUsage.processed, time, summarizeWindowElement, sfn);
    counter.increase('summarizedMetrics');
    return summarizedMetric;
  };

  const summarizePlanMetrics = (planMetadata, meteringPlan, cb) => {
    const summarizeFunction = summarizeMetric(
      planMetadata.metering_plan_id,
      meteringPlan.metrics,
      summarizeFunctionMemoizer,
      summarizePlanMetric
    );
    tmap(planMetadata.aggregated_usage, summarizeFunction, (err, usage) => {
      transformMapCb(
        err,
        planMetadata,
        { aggregated_usage: usage },
        cb)
      ;
    });
  };

  const summarizePlan = (planMetadata, i, l, cb) => {
    // Find the metrics configured for the given metering plan
    const getMeteringPlanCb = yieldable.functioncb(getMeteringPlan);

    const planId = planMetadata.metering_plan_id;
    if (pdebug.enabled) {
      uniquePlanIds.add(planId);
      counter.set('uniqueMeteringPlans', uniquePlanIds.size);
    }

    // Find the metrics configured for the given resource
    getMeteringPlanCb(planId, auth, (err, meteringPlan) => {
      if (err) {
        edebug('Could not obtain metering plan id %s due to: %o', planId, auth, err);
        cb(err);
        return;
      }

      summarizePlanMetrics(planMetadata, meteringPlan, cb);
      counter.increase('summarizedPlans');
    });
  };

  // Summarize the aggregated usage under a resource
  const summarizeResource = (resource, i, l, cb) => {
    debug('Summarizing resource %s', resource.resource_id);
    tmap(resource.plans, summarizePlan, (err, summarizedPlans) => {
      transformMapCb(err, resource, { plans: summarizedPlans }, cb);
    });
    counter.increase('summarizedResources');
  };

  const summarizeConsumer = (consumer, i, l, cb) => {
    debug('Summarizing consumer %s', consumer.consumer_id);
    tmap(consumer.resources, summarizeResource, (err, consumerAccum) => {
      transformMapCb(err, consumer, { resources: consumerAccum }, cb);
    });
    counter.increase('summarizedConsumers');
  };

  const summarizeSpace = (space, i, l, cb) => {
    debug('Summarizing space %s', space.space_id);
    tmap(space.resources, summarizeResource, (err, resourceAccum) => {
      if (err) {
        edebug('Could not summarize space resources due to: %o', err);
        cb(err);
        return;
      }

      tmap(space.consumers, summarizeConsumer, (err, consumerAccum) => {
        transformMapCb(
          err,
          space,
          {
            resources: resourceAccum,
            consumers: consumerAccum
          },
          cb
        );
      });
    });
    counter.increase('summarizedSpaces');
  };

  return {
    // Compute usage summaries for the given aggregated usage
    summarizeUsage: (cb) => {
      debug('Summarizing usage for time %o and aggregated usage %o', time, aggregatedUsage);

      tmap(aggregatedUsage.resources, summarizeResource, (err, resourcesAccum) => {
        debug('Summarizing aggregated usage for organization, %s', aggregatedUsage.organization_id);
        if (err) {
          edebug('Could not summarize resources due to: %o', err);
          cb(err);
          return;
        }

        tmap(aggregatedUsage.spaces, summarizeSpace, (err, spacesAccum) => {
          transformMapCb(
            err,
            aggregatedUsage,
            {
              resources: resourcesAccum,
              spaces: spacesAccum
            },
            cb
          );
        });
      });
    },
    summarizeInstanceUsage: function*() {
      debug('Summarizing instance usage for time %o and aggregated usage %o', time, aggregatedUsage);

      // Sets all quantities to their current quantity
      const setCurrentQuantity = (windows) => {
        each(windows, (w) => {
          each(w, (sw) => {
            if (sw) sw.quantity = sw.quantity.current;
          });
        });
      };

      // Find the metrics configured for the given metering plan
      const mplan = yield getMeteringPlan(aggregatedUsage.metering_plan_id, auth);
      const summarizedUsage = extend({}, aggregatedUsage, {
        accumulated_usage: map(aggregatedUsage.accumulated_usage, (m) => {
          setCurrentQuantity(m.windows);
          return summarizePlanMetric(
            m,
            summarizefn(aggregatedUsage.metering_plan_id, mplan.metrics, m.metric)
          );
        })
      });
      debug('Summarized instance usage %o', summarizedUsage);
      return summarizedUsage;
    }
  };
};

module.exports = summarizer;
module.exports.summarizeMetric = summarizeMetric;
module.exports.summarizeWindowElement = summarizeWindowElement;
