'use strict';

const { extend, each, filter, map, reduce, unzip } = require('underscore');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const { memoize } = require('abacus-lrucache');
const moment = require('abacus-moment');
const rconfigcb = require('abacus-rating-config');
const timewindow = require('abacus-timewindow');
const tmap = require('abacus-transform').map;
const yieldable = require('abacus-yieldable');

const rconfig = yieldable(rconfigcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');
const edebug = require('abacus-debug')('e-abacus-usage-reporting');
const pdebug = require('abacus-debug')('p-abacus-usage-reporting');

// Get rating plan
const getRatingPlan = function*(id, auth) {
  debug('Getting rating plan with id %s', id);
  const rplan = yield rconfig(id, auth);
  debug('Got rating plan %o', rplan);

  // Error when getting rating plan
  if (rplan.error) {
    edebug('Error when getting rating plan %s: %s', id, rplan.reason);
    throw extend({ statusCode: 200 }, rplan);
  }

  return rplan.rating_plan;
};

const maxAge = process.env.RESULTS_CACHE_MAX_AGE ? parseInt(process.env.RESULTS_CACHE_MAX_AGE) : 300000;

const lruOpts = {
  max: 500,
  maxAge: maxAge
};

const hashFunction = (t, values, from, to) =>
  `${t}${JSON.stringify(values)}` + `${moment.utc(from).valueOf()}${moment.utc(to).valueOf()}`;

const functionMemoizer = (key, fn) => fn ? memoize(fn, hashFunction, lruOpts) : undefined;

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => {
  if (a) a.charge = new BigNumber(a.charge).add(m && m.charge ? m.charge : 0).toNumber();
  else if (m && 'charge' in m) return { charge: m.charge };
  return a;
};

const buildWindows = (entity) =>
  map(unzip(map(entity, (element) => element.windows)), (zippedUsage) =>
    map(unzip(zippedUsage), (unzippedUsage) => reduce(unzippedUsage, sumCharges, null))
  );


const transformMapCb = (err, resource, accumulatedResult, cb) => {
  if (err) {
    cb(err);
    return;
  }

  cb(undefined, extend({}, resource, accumulatedResult));
};

// Return the charge function for a given plan and metric
const chargefn = (planId, metrics, metricName) => {
  const metric = filter(metrics, (m) => m.name === metricName)[0];
  if (!metric) {
    edebug('Plan change detected: metric %s missing from plan %s', metricName, planId);
    return () => 0;
  }
  return metric.chargefn;
};


// Traverse and calculate every single window + slack
const traverseWindows = (metric, processed, time, processFn, chargeFn) =>
  extend({}, metric, {
    windows: map(metric.windows, (window, windowIndex) =>
      map(window, (windowElement, windowElementIndex) => {
        // Calculate the from and to bounds of the window
        const bounds = timewindow.timeWindowBounds(processed, timewindow.dimensions[windowIndex], -windowElementIndex);
        return processFn(metric, windowElement, chargeFn, time, bounds);
      })
    )
  });

// Return the result from fn or null if fn is undefined
const chargeWindowElement = (metricName, windowElement, chargeFunction, time, bounds) => {
  if (!windowElement)
    return null;
  if (!chargeFunction)
    return extend({}, windowElement);

  try {
    return extend({}, windowElement, { charge: chargeFunction(time, windowElement.cost, bounds.from, bounds.to) });
  } catch (err) {
    edebug(`Failed to calculate charge for metric ${metricName}: %o`, err);
    return extend({}, windowElement, { charge: 0 });
  }
};

const chargeMetric = (planId, metrics, fnMemoizer, chargePlanFn) => (metric, i, l, cb) => {
  setImmediate(() => {
    const chargeFunction = fnMemoizer(
      planId + metric.metric,
      chargefn(planId, metrics, metric.metric)
    );

    try {
      debug(`Charging metric %o for plan ${planId}`, metric);
      cb(undefined, chargePlanFn(metric, chargeFunction));
    } catch (err) {
      edebug(`Failed to calculate charge for plan ${planId}, metric ${metric.metric}: %o`, err);
      cb(err);
    }
  });
};

const charger = (time, aggregatedUsage, auth, counter) => {
  const uniquePlanIds = new Set();
  const chargeFunctionMemoizer = memoize(functionMemoizer, (key) => key, lruOpts);

  // Calculates the charge for a metric under a plan, given the
  // metric object, query time, usage processed time, charge function
  const chargePlanMetric = (metric, chargeFunction) => {
    const chargedMetric = traverseWindows(metric, aggregatedUsage.processed, time, chargeWindowElement, chargeFunction);
    counter.increase('chargedMetrics');
    return chargedMetric;
  };

  // Calculate the charges for all the metrics under a plan
  const chargePlanMetrics = (planMetadata, ratingPlan, cb) => {
    const chargeFunction = chargeMetric(
      planMetadata.rating_plan_id,
      ratingPlan.metrics,
      chargeFunctionMemoizer,
      chargePlanMetric
    );
    tmap(planMetadata.aggregated_usage, chargeFunction, (err, calculatedUsage) => {
      transformMapCb(
        err,
        planMetadata,
        {
          aggregated_usage: calculatedUsage,
          windows: buildWindows(calculatedUsage)
        },
        cb
      );
    });
  };

  const chargePlan = (planMetadata, i, l, cb) => {
    const getRatingPlanCb = yieldable.functioncb(getRatingPlan);

    const planId = planMetadata.rating_plan_id;
    if (pdebug.enabled) {
      uniquePlanIds.add(planId);
      counter.set('uniqueRatingPlans', uniquePlanIds.size);
    }

    // Find the metrics configured for the given resource
    getRatingPlanCb(planId, auth, (err, ratingPlan) => {
      if (err) {
        edebug('Could not obtain rating plan id %s due to: %o', planId, auth, err);
        cb(err);
        return;
      }

      chargePlanMetrics(planMetadata, ratingPlan, cb);
      counter.increase('chargedPlans');
    });
  };

  const resourceMetrics = (resource) => {
    const metrics = new Set();
    each(resource.plans, (plan) => each(plan.aggregated_usage, (metric) => metrics.add(metric.metric)));
    return [...metrics];
  };

  const chargeAggregatedMetric = (metric, plans) => {

    // Filter the plan metrics to only include the current metric
    const planMetrics = map(plans, (p) => {
      return filter(p.aggregated_usage, (m) => m.metric === metric && m.windows)[0];
    });

    return extend(
      { metric: metric },
      {
        windows: map(planMetrics[0].windows, (w, i) => {
          return map(w, (s, j) => {
            const charge = reduce(
              planMetrics,
              (a, u) => {
                // Only add the plan usage window if it is defined.
                if (u && u.windows[i][j] && u.windows[i][j] !== null)
                  return a !== null ? a + u.windows[i][j].charge : u.windows[i][j].charge;
                return a;
              },
              null
            );
            return charge !== null ? { charge: charge } : charge;
          });
        })
      }
    );
  };

  // Charge the rated usage under a resource
  const chargeResource = (resource, i, l, cb) => {
    debug('Charging resource %s', resource.resource_id);
    // Compute the charge of each metric under the resource's plans
    tmap(resource.plans, chargePlan, (err, chargedPlans) => {
      // Return the resource's plans including the calculated charges and the
      // aggregated charge for the resource
      transformMapCb(
        err,
        resource,
        {
          aggregated_usage: map(
            resourceMetrics(resource),
            (metric) => chargeAggregatedMetric(metric, chargedPlans)
          ),
          plans: chargedPlans,
          windows: buildWindows(chargedPlans)
        },
        cb
      );
    });

    counter.increase('chargedResource');
  };

  const chargeConsumer = (consumer, i, l, cb) => {
    debug('Charging consumer %s', consumer.consumer_id);
    tmap(consumer.resources, chargeResource, (err, consumerResources) => {
      transformMapCb(
        err,
        consumer,
        {
          resources: consumerResources,
          windows: buildWindows(consumerResources)
        },
        cb
      );
    });
    counter.increase('chargedConsumers');
  };

  const chargeSpace = (space, i, l, cb) => {
    debug('Charging space %s', space.space_id);
    tmap(space.resources, chargeResource, (err, consumerResources) => {
      if (err) {
        cb(err);
        return;
      }

      tmap(space.consumers, chargeConsumer, (err, accumulatedConsumers) => {
        transformMapCb(
          err,
          space,
          {
            resources: consumerResources,
            consumers: accumulatedConsumers,
            windows: buildWindows(consumerResources)
          },
          cb
        );
      });
    });
    counter.increase('chargedSpaces');
  };

  return {
    chargeUsage: (cb) => {
      debug('Charging usage for time %o and rated usage %o', time, aggregatedUsage);

      // Clone the rated usage and extend if with the computed charges
      tmap(aggregatedUsage.resources, chargeResource, (err, consumerResources) => {
        debug('Charging aggregated usage for organization %s', aggregatedUsage.organization_id);
        if (err) {
          edebug('Could not charge resources due to: %o', err);
          cb(err);
          return;
        }

        tmap(aggregatedUsage.spaces, chargeSpace, (err, accumulatedSpaces) => {
          transformMapCb(
            err,
            aggregatedUsage,
            {
              resources: consumerResources,
              spaces: accumulatedSpaces,
              windows: buildWindows(consumerResources)
            },
            cb
          );
        });
      });
    },
    // Computes the charge for aggregated usage across plans for specific metric, given the plans object.
    chargeInstanceUsage: function*() {
      debug('Charging instance usage for time %o and rated usage %o', time, aggregatedUsage);

      // Find the metrics configured for the given resource
      const rplan = yield getRatingPlan(aggregatedUsage.rating_plan_id, auth);
      const accumulatedUsage = map(aggregatedUsage.accumulated_usage, (metric) =>
        chargePlanMetric(
          metric,
          chargefn(aggregatedUsage.rating_plan_id, rplan.metrics, metric.metric)
        )
      );
      const chargedUsage = extend({}, aggregatedUsage, {
        accumulated_usage: accumulatedUsage,
        windows: buildWindows(accumulatedUsage)
      });
      debug('Charged instance usage %o', chargedUsage);
      return chargedUsage;
    }
  };
};

module.exports = charger;
module.exports.chargeMetric = chargeMetric;
module.exports.chargeWindowElement = chargeWindowElement;
