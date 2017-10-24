'use strict';

// Usage reporting service.

const _ = require('underscore');
const contains = _.contains;
const extend = _.extend;
const filter = _.filter;
const first = _.first;
const map = _.map;
const omit = _.omit;
const reduce = _.reduce;
const unzip = _.unzip;
const zip = _.zip;

const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const Counter = require('abacus-counter');
const dataflow = require('abacus-dataflow');
const retry = require('abacus-retry');
const memoize = require('abacus-lrucache').memoize;
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const router = require('abacus-router');
const mconfigcb = require('abacus-metering-config');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const rconfigcb = require('abacus-rating-config');
const schema = require('abacus-schema');
const seqid = require('abacus-seqid');
const transform = require('abacus-transform');
const timewindow = require('abacus-timewindow');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');
const yieldable = require('abacus-yieldable');
const webapp = require('abacus-webapp');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const tmap = transform.map;

const brequest = yieldable(retry(breaker(batch(request))));

const mconfig = yieldable(mconfigcb);
const rconfig = yieldable(rconfigcb);

const graphql = schema.graphql.graphql;
const GraphQLSchema = schema.graphql.GraphQLSchema;
const GraphQLObjectType = schema.graphql.GraphQLObjectType;
const GraphQLNonNull = schema.graphql.GraphQLNonNull;
const GraphQLString = schema.graphql.GraphQLString;
const GraphQLFloat = schema.graphql.GraphQLFloat;
const GraphQLList = schema.graphql.GraphQLList;

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');
const edebug = require('abacus-debug')('e-abacus-usage-reporting');
const pdebug = require('abacus-debug')('p-abacus-usage-reporting');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// OAuth bearer access token with Abacus system access scopes
let systemToken;

const dbaliasAggregator = process.env.DBALIAS_AGGREGATOR || 'db';
const dbaliasAccumulator = process.env.DBALIAS_ACCUMULATOR || 'db';

// Resolve service URIs
const uris = urienv({
  account: 9881,
  auth_server: 9882,
  [dbaliasAggregator]: 5984,
  [dbaliasAccumulator]: 5984
});

// Configure rated usage db
const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage',
  undefined, uris[dbaliasAggregator]);
// Configure accumulated usage db
const accumulatordb = dataflow.db('abacus-accumulator-accumulated-usage',
  undefined, uris[dbaliasAccumulator]);

// Time dimensions
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () => /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {
  scale : 'm',
  width : 10
};

// Calculates the max number of time windows in a given time scale based on
// the slack's configuration
const maxSlack = (w) => {
  const slackscale = {
    M: { 4: 1 },
    D: { 4: 28, 3: 1 },
    h: { 4: 672, 3: 24, 2: 1 },
    m: { 4: 40320, 3: 1440, 2: 60, 1: 1 },
    s: { 4: 2419200, 3: 86400, 2: 3600, 1: 60, 0: 1 }
  };
  if(slack().scale && slackscale[slack().scale][w])
    return map(new Array(
      Math.ceil(1 / slackscale[slack().scale][w] * slack().width) + 1
    ), () => null);
  return [null];
};

// The window length based on the configured slack.
const findWindowLength = () => map([maxSlack(0),
  maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)], (w) => w.length);

// Adjust the windows to the desired t
const adjustWindows = (windows, ct, t, wl) => map(timewindow.adjustWindows(
  windows, ct, t), (w, i) => first(w, wl[i]));

// Return the charge function for a given plan and metric
const chargefn = (planId, metrics, metricName) => {
  const metric = filter(metrics, (m) => m.name === metricName)[0];
  if (!metric) {
    edebug('Plan change detected: metric %s missing from plan %s',
      metricName, planId);
    return undefined;
  }
  return metric.chargefn;
};

// Return the summarize function for a given metric
const summarizefn = (planId, metrics, metricName) => {
  const metric = filter(metrics, (m) => m.name === metricName)[0];
  if (!metric) {
    edebug('Plan change detected: metric %s missing from plan %s',
      metricName, planId);
    return undefined;
  }
  return metric.summarizefn;
};

const setImmediateEx = yieldable((cb) => {
  setImmediate(cb);
});

const isConsumerProcessedThisMonth = (consumerKey, startOfMonthKey) => {
  return seqid.pad16(dbclient.t(startOfMonthKey)) <
    seqid.pad16(dbclient.t(consumerKey));
};

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => {
  if(a)
    a.charge = new BigNumber(a.charge)
      .add(m && m.charge ? m.charge : 0).toNumber();
  else if(m && 'charge' in m)
    return { charge: m.charge };
  return a;
};

const maxAge = process.env.RESULTS_CACHE_MAX_AGE ?
  parseInt(process.env.RESULTS_CACHE_MAX_AGE) : 300000;

const lruOpts = {
  max: 500,
  maxAge: maxAge
};

const hashFunction = (t, values, from, to) =>
  `${t}${JSON.stringify(values)}` +
  `${moment.utc(from).valueOf()}${moment.utc(to).valueOf()}`;

const functionMemoizer = (key, fn) =>
  fn ? memoize(fn, hashFunction, lruOpts) : undefined;

// Traverse and calculate every single window + slack
const traverseWindows = (metric, processed, processFn) => extend({}, metric, {
  windows: map(metric.windows, (window, windowIndex) =>
    map(window, (windowElement, windowElementIndex) => {
      // Calculate the from and to bounds of the window
      const bounds = timewindow.timeWindowBounds(
        processed, dimensions[windowIndex], -windowElementIndex);
      return processFn(windowElement, bounds);
    }))
});

// Calculates the charge for a metric under a plan, given the
// metric object, query time, usage processed time, charge function
const chargePlanMetric = (metric, time, processed, cfn, counter) => {

  const chargeWindowElement = (windowElement, bounds) => {
    // Return the result from fn or null if fn is undefined
    return windowElement ? cfn ? extend({}, windowElement, {
      charge: cfn(time, windowElement.cost, bounds.from, bounds.to)
    }) : extend({}, windowElement) : null;
  };

  const chargedMetric = traverseWindows(metric, processed, chargeWindowElement);
  counter.increase('chargedMetrics');
  return chargedMetric;
};

// Computes the charge for aggregated usage across plans for specific
// Metric given the plans object.
const chargeAggregatedMetric = (metric, plans) => {
  // Filter the plan metrics to only include the current metric
  const planMetrics = map(plans, (p) => {
    return filter(p.aggregated_usage, (m) => m.metric === metric &&
      m.windows)[0];
  });
  return extend({ metric: metric }, {
    windows: map(planMetrics[0].windows, (w, i) => {
      return map(w, (s, j) => {
        const charge = reduce(planMetrics, (a, u) => {
          // Only add the plan usage window if it is defined.
          if(u && u.windows[i][j] && u.windows[i][j] !== null)
            return a !== null ? a + u.windows[i][j].charge :
              u.windows[i][j].charge;
          return a;
        }, null);
        return charge !== null ? { charge: charge } : charge;
      });
    })
  });
};

// Get rating plan
const getRatingPlan = function *(id, auth) {
  debug('Getting rating plan with id %s', id);
  const rplan = yield rconfig(id, auth);
  debug('Got rating plan %o', rplan);

  // Error when getting rating plan
  if(rplan.error) {
    edebug('Error when getting rating plan %s: %s', id, rplan.reason);
    throw extend({ statusCode: 200 }, rplan);
  }

  return rplan.rating_plan;
};

// Get metering plan
const getMeteringPlan = function *(id, auth) {
  debug('Getting metering plan with id %s', id);
  const mplan = yield mconfig(id, auth);
  debug('Got metering plan %o', mplan);

  // Error when getting metering plan
  if(mplan.error) {
    debug('Error when getting metering plan %s: %s', id, mplan.reason);
    throw extend({ statusCode: 200 }, mplan);
  }

  return mplan.metering_plan;
};

const buildWindows = (entity) =>
  map(zip.apply(_, map(entity, (element) => element.windows)),
    (zippedUsage) => map(unzip(zippedUsage),
      (unzippedUsage) => reduce(unzippedUsage, sumCharges, null)));

const chargeUsageCb = (time, ratedUsage, auth, counter, cb) => {
  debug('Charging usage for time %o and rated usage %o',
    time, ratedUsage);

  const chargeFunctionMemoizer =
    memoize(functionMemoizer, (key) => key, lruOpts);

  // Charge the rated usage under a resource
  const chargeResource = (resource, i, l, cb) => {

    const getRatingPlanCb = yieldable.functioncb(getRatingPlan);

    // List all metrics used in the resource.
    let metrics = [];
    const mapFn = (plan, i, l, cb) => setImmediate(() => {
      // Find the metrics configured for the given resource
      getRatingPlanCb(plan.rating_plan_id, auth, (err, rplan) => {
        if (err) {
          debug('Could not obtain rating plan id %s due to: %o',
            plan.rating_plan_id, auth, err);
          cb(err);
          return;
        }

        // Calculate the charges for all the metrics under a plan
        const calculatedUsage = map(plan.aggregated_usage, (metric) => {
          // Fill in metrics if new metric is found
          if(!contains(metrics, metric.metric))
            metrics.push(metric.metric);

          const chargeFunction = chargeFunctionMemoizer(
            plan.rating_plan_id + metric.metric,
            chargefn(plan.rating_plan_id, rplan.metrics, metric.metric));

          return chargePlanMetric(metric, time, ratedUsage.processed,
            chargeFunction, counter);
        });

        // Return the metrics including the calculated charges and the
        // aggregated charge for the plan
        const ret = extend({}, plan, {
          aggregated_usage: calculatedUsage,
          windows: buildWindows(calculatedUsage)
        });

        counter.increase('chargedPlans');

        cb(undefined, ret);
      });
    });

    // Compute the charge of each metric under the resource's plans
    tmap(resource.plans, mapFn, (err, plans) => {
      if (err) {
        cb(err);
        return;
      }

      // Return the resource's plans including the calculated charges and the
      // aggregated charge for the resource
      const resourcePlans = extend({}, resource, {
        aggregated_usage: map(metrics, (m) => chargeAggregatedMetric(m, plans)),
        plans: plans,
        windows: buildWindows(plans)
      });
      cb(undefined, resourcePlans);
    });

    counter.increase('chargedResource');
  };

  // Clone the rated usage and extend if with the computed charges
  tmap(ratedUsage.resources, chargeResource, (err, consumerResources) => {
    if (err) {
      cb(err);
      return;
    }

    const chargeConsumer = (consumer, i, l, cb) => {
      tmap(consumer.resources, chargeResource, (err, consumerResources) => {
        if (err) {
          cb(err);
          return;
        }
        const res = extend({}, consumer, {
          resources: consumerResources,
          windows: buildWindows(consumerResources)
        });
        cb(undefined, res);
      });

      counter.increase('chargedConsumers');
    };

    const chargeSpace = (space, i, l, cb) => {
      tmap(space.resources, chargeResource, (err, consumerResources) => {
        if (err) {
          cb(err);
          return;
        }

        tmap(space.consumers, chargeConsumer, (err, accumulatedConsumers) => {
          if (err) {
            cb(err);
            return;
          }
          const res = extend({}, space, {
            resources: consumerResources,
            consumers: accumulatedConsumers,
            windows: buildWindows(consumerResources)
          });
          cb(undefined, res);
        });
      });

      counter.increase('chargedSpaces');
    };

    tmap(ratedUsage.spaces, chargeSpace, (err, accumulatedSpaces) => {
      if (err) {
        cb(err);
        return;
      }
      const c = extend({}, ratedUsage, {
        resources: consumerResources,
        spaces: accumulatedSpaces,
        windows: buildWindows(consumerResources)
      });
      cb(undefined, c);
    });
  });
};

// Compute the charges for the given rated usage
const chargeUsage = function *(time, ratedUsage, auth) {
  const yChargeUsage = yieldable(chargeUsageCb);
  return yield yChargeUsage(time, ratedUsage, auth, new Counter());
};

const chargeInstanceUsage = function *(time, ratedUsage, auth, counter) {
  debug('Charging instance usage for time %o and rated usage %o',
    time, ratedUsage);

  // Find the metrics configured for the given resource
  const rplan = yield getRatingPlan(ratedUsage.rating_plan_id, auth);
  const accumulatedUsage = map(ratedUsage.accumulated_usage, (metric) =>
    chargePlanMetric(metric, time, ratedUsage.processed,
      chargefn(ratedUsage.rating_plan_id, rplan.metrics, metric.metric),
      counter));
  const chargedUsage = extend({}, ratedUsage, {
    accumulated_usage: accumulatedUsage,
    windows: buildWindows(accumulatedUsage)
  });
  debug('Charged instance usage %o', chargedUsage);
  return chargedUsage;
};

// Calculates the summary for a metric under a plan, given the
// metric object, query time, usage processed time, charge function
const summarizeMetric = (metric, time, processed, sfn, counter) => {

  // Clone the metric and extend with a usage summary
  const summarizeWindowElement = (windowElement, bounds) => {
    // Return the result from summarize or null if sfn is undefined
    return windowElement ? sfn ? extend({}, windowElement, {
      summary: sfn(time, windowElement.quantity, bounds.from, bounds.to)
    }) : extend({}, windowElement) : null;
  };

  const summarizedMetric = traverseWindows(metric, processed,
    summarizeWindowElement);
  counter.increase('summarizedMetrics');
  return summarizedMetric;
};

const transformMapCb = (err, resource, accumulatedResult, cb) => {
  if (err) {
    cb(err);
    return;
  }

  cb(undefined, extend({}, resource, accumulatedResult));
};

// Compute usage summaries for the given aggregated usage
const summarizeUsageCb = (time, aggregatedUsage, auth, counter, cb) => {
  debug('Summarizing usage for time %o and aggregated usage %o',
    time, aggregatedUsage);

  const summarizeFunctionMemoizer =
    memoize(functionMemoizer, (key) => key, lruOpts);

  const summarizePlan = (plan, i, l, cb) => {
    // Find the metrics configured for the given metering plan
    const getMeteringPlanCb = yieldable.functioncb(getMeteringPlan);

    getMeteringPlanCb(plan.metering_plan_id, auth, (err, mplan) => {
      if (err) {
        debug('Could not obtain metering plan id %s due to: %o',
          plan.metering_plan_id, auth, err);
        cb(err);
        return;
      }

      const mapFn = (metric, i, l, cb) => setImmediate(() => {
        const summarizeFunction = summarizeFunctionMemoizer(
          plan.metering_plan_id + metric.metric,
          summarizefn(plan.metering_plan_id, mplan.metrics, metric.metric)
        );

        cb(undefined, summarizeMetric(metric, time,
          aggregatedUsage.processed, summarizeFunction, counter));
      });

      tmap(plan.aggregated_usage, mapFn, (err, planAccum) => {
        transformMapCb(err, plan, { aggregated_usage: planAccum }, cb);
      });

      counter.increase('summarizedPlans');
    });
  };

  // Summarize the aggregated usage under a resource
  const summarizeResource = (resource, i, l, cb) => {
    debug('Summarizing resource %s', resource.resource_id);
    tmap(resource.plans, summarizePlan, (err, resAccum) => {
      transformMapCb(err, resource, { plans: resAccum }, cb);
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
        debug('Could not summarize space resources due to: %o', err);
        cb(err);
        return;
      }

      tmap(space.consumers, summarizeConsumer, (err, consumerAccum) => {
        transformMapCb(err, space, {
          resources: resourceAccum,
          consumers: consumerAccum
        }, cb);
      });
    });
    counter.increase('summarizedSpaces');
  };

  tmap(aggregatedUsage.resources, summarizeResource, (err, resourcesAccum) => {
    debug('Summarizing aggregated usage for organization, %s',
      aggregatedUsage.organization_id);
    if (err) {
      debug('Could not summarize resources due to: %o', err);
      cb(err);
      return;
    }

    tmap(aggregatedUsage.spaces, summarizeSpace, (err, spacesAccum) => {
      transformMapCb(err, aggregatedUsage, {
        resources: resourcesAccum,
        spaces: spacesAccum
      }, cb);
    });
  });
};

// Compute usage summaries for the given aggregated usage
const summarizeUsage = function *(time, aggregatedUsage, auth) {
  const summarizeUsageEx = yieldable(summarizeUsageCb);
  return yield summarizeUsageEx(time, aggregatedUsage, auth, new Counter());
};

const summarizeInstanceUsage = function *(time, aggregaredUsage,
  auth, counter) {
  debug('Summarizing instance usage for time %o and aggregated usage %o',
    time, aggregaredUsage);

  // Sets all quantities to their current quantity
  const setCurrentQuantity = (windows) => {
    map(windows, (w) => {
      map(w, (sw) => {
        if(sw)
          sw.quantity = sw.quantity.current;
      });
    });
  };

  // Find the metrics configured for the given metering plan
  const mplan = yield getMeteringPlan(aggregaredUsage.metering_plan_id, auth);
  const summarizedUsage = extend({}, aggregaredUsage, {
    accumulated_usage: map(aggregaredUsage.accumulated_usage, (m) => {
      setCurrentQuantity(m.windows);
      return summarizeMetric(m, time, aggregaredUsage.processed,
        summarizefn(aggregaredUsage.metering_plan_id, mplan.metrics, m.metric),
        counter);
    })
  });
  debug('Summarized instance usage %o', summarizedUsage);
  return summarizedUsage;
};

// Purge previous quantities
const purgeOldQuantities = (doc) => {
  const deletePreviousQuantity = (entity) => {
    if (entity.aggregated_usage)
      map(entity.aggregated_usage, (aggregatedUsage) =>
        map(aggregatedUsage.windows, (timeWindow) =>
          map(timeWindow, (quantity) => {
            if (quantity)
              delete quantity.previous_quantity;
          })));
  };

  const purgeInResource = (resource) => {
    deletePreviousQuantity(resource);
    map(resource.plans, (plan) => deletePreviousQuantity(plan));
  };

  map(doc.resources, (resource) => purgeInResource(resource));
  if(doc.spaces)
    map(doc.spaces, (space) =>
      map(space.resources, (resource) =>
        purgeInResource(resource)));
};

const updateConsumers = function *(usage, consumers, spaceId, consumersDocMap) {
  const updatedConsumers = [];

  for (let c of consumers) {
    debug('Processing consumer %s', c.id);

    // release the event loop for orgs with many consumers
    yield setImmediateEx();

    // Retrieve the consumer doc with the matching doc_id
    const consumer = consumersDocMap.get(
      [usage.organization_id, spaceId, c.id].join('/'));
    // skip consumer with missing doc
    if (!consumer)
      continue;
    purgeOldQuantities(consumer);

    // Shift all the windows
    map(consumer.resources, (resource) => {
      map(resource.plans, (plan) => {
        map(plan.aggregated_usage, (au) => {
          map(au.windows, (w, i) => {
            timewindow.shiftWindow(consumer.processed, usage.processed,
              w, dimensions[i]);
          });
        });
      });
    });

    updatedConsumers.push(omit(consumer,
      ['_id', 'id', '_rev', 'accumulated_usage_id',
        'processed', 'processed_id', 'resource_instance_id', 'start',
        'end', 'organization_id', 'resource_id', 'plan_id',
        'pricing_country', 'prices']));
  }

  return updatedConsumers;
};

const skipMissingConsumer = (consumerDoc, consumerKey, startOfMonthKey) => {
  if (!consumerDoc || !consumerDoc.doc) {
    const errorMsg = `Failed to find consumer with id ${consumerKey}`;
    edebug(errorMsg);
    // throw an error in case the consumer processed time is in the current
    // month or skip it otherwise
    if(isConsumerProcessedThisMonth(consumerKey, startOfMonthKey))
      throw extend(new Error(errorMsg), {
        statusCode: 500,
        error: errorMsg,
        noretry: true,
        nobreaker: true
      });

    return true;
  }
  return false;
};

const filterConsumerResources = (consumerDoc, consumerKey, resourceId) => {
  debug('Filtering consumer %s resources by resource id: %s',
    consumerKey, resourceId);

  consumerDoc.resources = filter(consumerDoc.resources, (res) =>
    res.resource_id === resourceId);
};

const buildConsumersMap = (consumers, ids, startOfMonthKey, resourceId) => {
  const consumersDocMap = new Map();

  for (let i = 0; i < consumers.length; i++) {
    if (skipMissingConsumer(consumers[i], ids[i], startOfMonthKey))
      continue;

    const consumerKey = dbclient.k(consumers[i].doc._id);
    if (resourceId)
      filterConsumerResources(consumers[i].doc, consumerKey, resourceId);
    consumersDocMap.set(consumerKey, consumers[i].doc);
  }

  return consumersDocMap;
};

// Returns a copy of the passed in org usage with the consumers populated
const consumerUsage = function *(usage, resourceId, startOfMonthKey) {
  // Collect the list of consumer ids to query for
  const ids = [];
  map(usage.spaces, (space) => {
    map(space.consumers, (consumer) => {
      ids.push(['k', usage.organization_id, space.space_id, consumer.id,
        't', consumer.t].join('/'));
    });
  });

  debug('Retrieving consumer usage for organization %o and consumers %o',
    usage.organization_id, ids);
  const consumers = (yield aggregatordb.allDocs({
    keys: ids,
    include_docs: true
  })).rows;

  const consumersDocMap = buildConsumersMap(consumers, ids,
    startOfMonthKey, resourceId);

  // Return a copy of the usage data with consumer objects populated
  const doc = extend({}, usage);
  for (let space of doc.spaces)
    space.consumers = yield updateConsumers(usage,
      space.consumers, space.space_id, consumersDocMap);
  debug('Report generation completed');
  return doc;
};

const getConsumerUsage = function *(orgId, time, auth, resourceId) {
  // Forward authorization header field to account to authorize
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time', extend(o, {
      org_id: orgId,
      time: time
    }));

  // Authorization failed. Unable to retrieve account information
  // for the given organization
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  // Compute the query range
  const d = moment.utc(time);
  const mt = moment.utc([d.year(), d.month(), 1]).valueOf();
  const sid = dbclient.kturi(orgId, seqid.pad16(time)) + 'ZZZ';
  const eid = dbclient.kturi(orgId, seqid.pad16(mt));

  debug('Retrieving latest rated usage between %s and %s', eid, sid);
  const doc = yield aggregatordb.allDocs({
    endkey: eid,
    startkey: sid,
    descending: true,
    limit: 1,
    include_docs: true
  });

  if(!doc.rows.length) {
    debug('No existing rated usage');
    return {
      id: dbclient.kturi(orgId, time),
      organization_id: orgId,
      start: mt,
      end: time,
      resources: [],
      spaces: []
    };
  }

  const usageDoc = doc.rows[0].doc;
  debug('Found rated usage %o', usageDoc);
  purgeOldQuantities(usageDoc);

  if (resourceId) {
    debug('Filtering usage document for resource: %s', resourceId);
    usageDoc.resources = filter(usageDoc.resources, (res) =>
      res.resource_id === resourceId);
    for (let space of usageDoc.spaces)
      space.resources = filter(space.resources, (res) =>
        res.resource_id === resourceId);
  }

  return yield consumerUsage(usageDoc, resourceId, eid);
};

// Return the usage for an org in a given time period
const orgUsage = (orgId, time = moment.now(), auth, resourceId, cb) => {
  const consumerUsageCb = yieldable.functioncb(getConsumerUsage);
  consumerUsageCb(orgId, time, auth, resourceId, (err, consumerUsage) => {
    if(err) {
      edebug('Could not generate consumer usage for org %s due to: %o',
        orgId, err);
      cb(err);
      return;
    }

    const tokenAuth = systemToken && systemToken();
    const counter = new Counter();
    summarizeUsageCb(time, consumerUsage, tokenAuth, counter,
      (err, summarizedUsage) => {
        if(err) {
          edebug('Could not summarize usage for org %s due to: %o',
            orgId, err);
          cb(err);
          return;
        }

        chargeUsageCb(time, summarizedUsage, tokenAuth, counter,
          (err, chargedUsage) => {
            if(err) {
              edebug('Could not charge usage for org %s due to: %o',
                orgId, err);
              cb(err);
              return;
            }

            pdebug('Organization report for %s has counters: %o',
              orgId, counter.list());
            cb(undefined, chargedUsage);
          });
      });
  });
};

// Return the usage for a list of orgs in a given time period
const orgsUsageCb = (orgIds, time, auth, cb) => {
  tmap(orgIds, (orgid, i, l, cb) => orgUsage(orgid, time, auth, undefined, cb),
    (err, result) => cb(err, result));
};

const orgsUsage = yieldable(orgsUsageCb);

// Return the usage for a resource instance for a particular plan in a given
// organization, consumer, time period
const resourceInstanceUsage = function *(orgid, spaceid, resourceInstanceId,
  consumerId, planid, meteringPlanId, ratingPlanId, pricingPlanId,
  timeBasedKeySegment, time, auth) {
  // Forward authorization header field to account to authorize
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time', extend(o, {
      org_id: orgid,
      time: time
    }));

  // Authorization failed. Unable to retrieve account information
  // for the given organization
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  const id = ['k', orgid, resourceInstanceId, consumerId, planid,
    meteringPlanId, ratingPlanId, pricingPlanId,
    't', timeBasedKeySegment].join('/');

  const doc = yield accumulatordb.get(id);

  if(!doc) {
    debug('No resource instance usage found for %s on %s',
      resourceInstanceId, time);

    // Return an empty usage report if no usage was found
    return {};
  }

  // Adjust the windows to the requested time
  map(doc.accumulated_usage, (au) => {
    au.windows = adjustWindows(au.windows, doc.processed, time,
      findWindowLength());
  });

  debug('Found accumulated usage %o', doc);
  const counter = new Counter();
  const resourceInstanceReport = yield chargeInstanceUsage(
    doc.processed,
    yield summarizeInstanceUsage(doc.processed, doc, auth, counter),
    auth,
    counter
  );

  pdebug('Resource instance report for %s has counters: %o',
    id, counter.list());

  return resourceInstanceReport;
};

// Return the usage for an account in a given time period
const accountUsage = function *(accountid, time, auth) {
  const t = time || moment.now();

  // Forward authorization header field to account
  const o = auth ? { headers: { authorization: auth } } : {};

  const account = yield brequest.get(
    uris.account + '/v1/accounts/:account_id', extend(o, {
      account_id: accountid
    }));

  // Validation failed. Unable to retrieve account information
  // for the given account id
  if (account.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw account;
  }

  if(!account.body || !account.body.organizations)
    return undefined;
  return yield orgsUsage(account.body.organizations, t, auth);
};

// Define GraphQL query schema
const organizationType = schemas.organizationReport.graph();
const instanceType = schemas.resourceInstanceReport.graph();

const graphSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'query',
    fields: () => ({
      organization: {
        type: organizationType,
        args: {
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgUsage)(
            args.organization_id, args.time, args.authorization, undefined);
        }
      },
      organizations: {
        type: new GraphQLList(organizationType),
        args: {
          organization_ids: {
            name: 'organization_ids',
            type: new GraphQLList(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgsUsage)(
            args.organization_ids, args.time, args.authorization);
        }
      },
      account: {
        type: new GraphQLList(organizationType),
        args: {
          account_id: {
            name: 'account_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(accountUsage)(
            args.account_id, args.time, args.authorization);
        }
      },
      resource_instance: {
        type: instanceType,
        args: {
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          space_id: {
            name: 'space_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          consumer_id: {
            name: 'consumer_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          resource_instance_id: {
            name: 'resource_instance_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          plan_id: {
            name: 'plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          metering_plan_id: {
            name: 'metering_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          rating_plan_id: {
            name: 'rating_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          pricing_plan_id: {
            name: 'pricing_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          t: {
            name: 't',
            type: GraphQLString
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(resourceInstanceUsage)(
            args.organization_id, args.space_id, args.resource_instance_id,
            args.consumer_id, args.plan_id, args.metering_plan_id,
            args.rating_plan_id, args.pricing_plan_id, args.t, args.time,
            args.authorization);
        }
      }
    })
  })
});

// Run a GraphQL query as a generator
const runQuery = function *(query) {
  // Convert the promise returned by graphql to a generator then yield it
  return yield yieldable(graphql(graphSchema, query));
};

// Return OAuth system scopes needed to retrieve org usage
const sysScopes = () => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return OAuth resource or system scopes needed to retrieve resource instance
// usage
const scopes = (resourceId) => secured() ? {
  resource: [['abacus.usage', resourceId, 'read'].join('.')],
  system: ['abacus.usage.read']
} : undefined;

// Retrieve a usage report summary for a given org and time in msec
const retrieveUsage = (req, res, cb) => {
  debug('Retrieving rated usage for organization %s on %s',
    req.params.organization_id, req.params.time);

  let resourceId;

  if (secured())
    try {
      const parsedScopes =
        oauth.parseTokenScope(req.headers && req.headers.authorization);
      debug('Parsed token scopes %o', parsedScopes);
      if (parsedScopes.readResourceScopes.length > 0) {
        resourceId = parsedScopes.readResourceScopes[0];
        debug('Using resource ID %s', resourceId);
      }
      else if (!parsedScopes.hasSystemReadScope) {
        res.status(403).send('Invalid token: insufficient scope');
        return;
      }
    }
    catch (e) {
      debug('Access validation failed with %o', e);
      res.status(403).send(e.error);
      return;
    }

  // Retrieve and return the rated usage for the given org and time
  orgUsage(req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization,
    resourceId,
    (err, usage) => {
      if (err) {
        res.status(err.statusCode || 500).send(err);
        return;
      }

      cb(undefined, {
        body: omit(dbclient.undbify(usage),
          ['last_rated_usage_id', 'aggregated_usage_id',
            'accumulated_usage_id', 'resource_instance_id',
            'consumer_id', 'resource_id', 'plan_id','pricing_country','prices'])
      });
    });
};

// Retrieve a usage report summary for a resource instance given the
// org, space, resource instance, consumer, plan, metering plan,
// rating plan, pricing plan, t, time
const retrieveResourceInstanceUsage = function *(req) {
  debug('Retrieving rated usage for resource instance %s on %s',
    req.params.resource_instance_id, req.params.time);

  if (secured())
    oauth.authorize(req.headers && req.headers.authorization,
      scopes(req.params.resource_id));

  const doc = yield resourceInstanceUsage(
    req.params.organization_id,
    req.params.space_id,
    req.params.resource_instance_id,
    req.params.consumer_id, req.params.plan_id,
    req.params.metering_plan_id,
    req.params.rating_plan_id,
    req.params.pricing_plan_id,
    req.params.t,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization
  );

  return {
    body: omit(dbclient.undbify(doc),
      ['last_rated_usage_id', 'aggregated_usage_id', 'accumulated_usage_id'])
  };
};

// Create an express router
const routes = router();

// Retrieve a usage report summary for a given org and time in msec
routes.get(
  '/v1/metering/organizations/:organization_id/aggregated/usage/:time',
  throttle(retrieveUsage));

routes.get(
  '/v1/metering/organizations/:organization_id/aggregated/usage',
  throttle(retrieveUsage));

routes.get(
  '/v1/metering/organizations/:organization_id/spaces/:space_id/' +
  'resource_id/:resource_id/resource_instances/:resource_instance_id/' +
  'consumers/:consumer_id/plans/:plan_id/metering_plans/:metering_plan_id/' +
  'rating_plans/:rating_plan_id/pricing_plans/:pricing_plan_id/' +
  't/:t/aggregated/usage/:time',
  throttle(retrieveResourceInstanceUsage));

// Retrieve a usage summary using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query',
  throttle(function *(req) {
    debug(
      'Retrieving rated usage using graphql query %s', req.params.query);

    if (secured())
      oauth.authorize(req.headers && req.headers.authorization, sysScopes());

    const q = req.headers && req.headers.authorization ?
      req.params.query.replace(/(.*)\((.*)/,
        '$1(authorization: "' + req.headers.authorization + '", $2') :
      req.params.query;
    debug('Modified graphql query %s', q);

    // Run the given GraphQL query and return the result
    const doc = yield runQuery(q);
    debug('Graphql query result %o', doc);
    if(doc.errors) {
      edebug('Graphql query error %o', doc.errors);
      debug('Graphql query error %o', doc.errors);
      throw extend(
        new Error('Graphql query error - ' + doc.errors[0].message), {
          statusCode: 400,
          error: 'query',
          reason: doc.errors[0].message,
          noretry: true,
          nobreaker: true
        });
    }

    return {
      body: omit(dbclient.undbify(doc.data),
        ['last_rated_usage_id', 'aggregated_usage_id', 'accumulated_usage_id',
          'resource_instances', 'resource_id', 'plan_id', 'pricing_country',
          'prices'])
    };
  }));

// Create a reporting service app
const reporting = () => {
  // Create the Webapp
  const app = webapp();

  // Secure organizations, metering and batch routes
  // using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  reporting().listen();
};

// Export our public functions
module.exports = reporting;
module.exports.runCLI = runCLI;
module.exports.consumerUsage = consumerUsage;
module.exports.summarizeUsage = summarizeUsage;
module.exports.chargeUsage = chargeUsage;
