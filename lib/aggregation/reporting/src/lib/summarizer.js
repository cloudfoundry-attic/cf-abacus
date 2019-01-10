'use strict';

const { extend, each, filter, map, omit, reduce } = require('underscore');
const async = require('async');

const mapLimit = (collection, iteratee, cb) => async.mapLimit(collection, 50, iteratee, cb);

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const mconfigcb = require('abacus-metering-config');
const timewindow = require('abacus-timewindow');
const yieldable = require('abacus-yieldable');

const mconfig = yieldable(mconfigcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');
const edebug = require('abacus-debug')('e-abacus-usage-reporting');

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

const transformMapCb = (err, resource, accumulatedResult, cb) => {
  if (err) {
    cb(err);
    return;
  }

  cb(undefined, extend({}, resource, accumulatedResult));
};

// Traverse and calculate every single window + slack
const traverseWindows = (metric, end, time, processFn, summarizeFn) =>
  extend({}, metric, {
    windows: map(metric.windows, (window, windowIndex) =>
      map(window, (windowElement, windowElementIndex) => {
        // Calculate the from and to bounds of the window
        const bounds = timewindow.timeWindowBounds(end, timewindow.dimensions[windowIndex], -windowElementIndex);
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
const summarizeWindowElement = (metric, element, summaryFn, time, bounds) => {
  if (!element)
    return null;

  // Trying to reduce the report size. Not needed if no cost data in DB.
  const windowElement = omit(element, 'cost');

  if (!summaryFn)
    return extend({}, windowElement);

  try {
    return extend({}, windowElement, { summary: summaryFn(time, windowElement.quantity, bounds.from, bounds.to) });
  } catch (err) {
    edebug(`Failed to calculate summarize for metric ${metric}: %o`, err);
    return extend({}, windowElement, { summary: 0 });
  }
};

const summarizeMetric = (planId, metrics, summarizePlanFn) => (metric, cb) => {
  setImmediate(() => {
    const summarizeFunction = summarizefn(planId, metrics, metric.metric);

    try {
      debug(`Summarizing metric %o for plan ${planId}`, metric);
      cb(undefined, summarizePlanFn(metric, summarizeFunction));
    } catch (err) {
      edebug(`Failed to calculate summarize for plan ${planId}, metric ${metric.metric}: %o`, err);
      cb(err);
    }
  });
};

const summarizer = (time, aggregatedUsage, auth) => {
  // Calculates the summary for a metric under a plan, given the
  // metric object, query time, usage processed time, summarize function
  const summarizePlanMetric = (metric, sfn) =>
    traverseWindows(metric, aggregatedUsage.end, time, summarizeWindowElement, sfn);

  const summarizePlanMetrics = (planMetadata, meteringPlan, cb) => {
    const summarizeFunction = summarizeMetric(
      planMetadata.metering_plan_id,
      meteringPlan.metrics,
      summarizePlanMetric
    );
    mapLimit(planMetadata.aggregated_usage, summarizeFunction, (err, usage) => {
      transformMapCb(
        err,
        planMetadata,
        { aggregated_usage: usage },
        cb)
      ;
    });
  };

  const summarizePlan = (planMetadata, cb) => {
    // Find the metrics configured for the given metering plan
    const getMeteringPlanCb = yieldable.functioncb(getMeteringPlan);

    const planId = planMetadata.metering_plan_id;

    // Find the metrics configured for the given resource
    getMeteringPlanCb(planId, auth, (err, meteringPlan) => {
      if (err) {
        edebug('Could not obtain metering plan id %s due to: %o', planId, auth, err);
        cb(err);
        return;
      }

      summarizePlanMetrics(planMetadata, meteringPlan, cb);
    });
  };

  const resourceMetrics = (resource) => {
    const metrics = new Set();
    each(resource.plans, (plan) => each(plan.aggregated_usage, (metric) => metrics.add(metric.metric)));
    return [...metrics];
  };

  const aggregatePlanMetric = (planMetrics, windowIndex, slotIndex) => {
    const aggregatedResult = reduce(planMetrics, (aggregator, usage) => {
      // Only add the plan usage window if it is defined.
      if (usage && usage.windows[windowIndex][slotIndex] && usage.windows[windowIndex][slotIndex] !== null) {
        const quantity = typeof usage.windows[windowIndex][slotIndex].quantity !== 'number'
          ? 0
          : usage.windows[windowIndex][slotIndex].quantity;
        const summary = usage.windows[windowIndex][slotIndex].summary;
        return aggregator === null
          ? { quantity: quantity, summary: summary }
          : { quantity: aggregator.quantity + quantity, summary: aggregator.summary + summary };
      }
      return aggregator;
    }, null);

    return aggregatedResult !== null
      ? { quantity: aggregatedResult.quantity, summary: aggregatedResult.summary }
      : null;
  };

  const summarizeAggregatedMetric = (metric, plans) => {

    // Filter the plan metrics to only include the current metric
    const planMetrics = map(plans,
      (p) => filter(p.aggregated_usage, (m) => m.metric === metric && m.windows)[0]);

    const aggregateWindows = (windows) =>
      map(windows, (window, windowIndex) =>
        map(window, (slot, slotIndex) => aggregatePlanMetric(planMetrics, windowIndex, slotIndex)));

    return extend(
      { metric: metric },
      { windows: aggregateWindows(planMetrics[0].windows) }
    );
  };

  // Summarize the aggregated usage under a resource
  const summarizeResource = (resource, cb) => {
    debug('Summarizing resource %s', resource.resource_id);
    mapLimit(resource.plans, summarizePlan, (err, summarizedPlans) => {
      transformMapCb(
        err,
        resource,
        {
          aggregated_usage: map(
            resourceMetrics(resource),
            (metric) => summarizeAggregatedMetric(metric, summarizedPlans)
          ),
          plans: summarizedPlans
        },
        cb);
    });
  };

  const summarizeConsumer = (consumer, cb) => {
    debug('Summarizing consumer %s', consumer.consumer_id);
    mapLimit(consumer.resources, summarizeResource, (err, consumerAccum) => {
      transformMapCb(err, consumer, { resources: consumerAccum }, cb);
    });
  };

  const summarizeSpace = (space, cb) => {
    debug('Summarizing space %s', space.space_id);
    mapLimit(space.resources, summarizeResource, (err, resourceAccum) => {
      if (err) {
        edebug('Could not summarize space resources due to: %o', err);
        cb(err);
        return;
      }

      mapLimit(space.consumers, summarizeConsumer, (err, consumerAccum) => {
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
  };

  return {
    // Compute usage summaries for the given aggregated usage
    summarizeUsage: (cb) => {
      debug('Summarizing usage for time %o and aggregated usage %o', time, aggregatedUsage);

      mapLimit(aggregatedUsage.resources, summarizeResource, (err, resourcesAccum) => {
        debug('Summarizing aggregated usage for organization, %s', aggregatedUsage.organization_id);
        if (err) {
          edebug('Could not summarize resources due to: %o', err);
          cb(err);
          return;
        }

        mapLimit(aggregatedUsage.spaces, summarizeSpace, (err, spacesAccum) => {
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
