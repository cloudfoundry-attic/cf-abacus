'use strict';

const { each, extend, filter, map, isNaN, isNull, isUndefined } = require('underscore');

const cluster = require('abacus-cluster');
const dataflow = require('abacus-dataflow');
const dbclient = require('abacus-dbclient');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const lrucache = require('abacus-lrucache');
const mconfigcb = require('abacus-metering-config');
const oauth = require('abacus-oauth');
const timewindow = require('abacus-timewindow');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');

const { createDataflowReducerConfig } = require('./lib/aggregator-config');

const { newOrg, newSpace, newConsumer, reviveOrg, reviveSpace, reviveCon } = require('./lib/models');

const mconfig = yieldable(mconfigcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');
const edebug = require('abacus-debug')('e-abacus-usage-aggregator');

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
  sink: undefined
});

// Purge previous quantities
const purgeOldQuantities = (doc) => {
  const purgeInResource = (r) => {
    if (r.aggregated_usage)
      each(r.aggregated_usage, (au) =>
        each(au.windows, (tw) =>
          each(tw, (q) => {
            if (q) delete q.previous_quantity;
          })
        )
      );
    each(r.plans, (p) =>
      each(p.aggregated_usage, (au) =>
        each(au.windows, (tw) =>
          each(tw, (q) => {
            if (q) delete q.previous_quantity;
          })
        )
      )
    );
  };
  each(doc.resources, (r) => purgeInResource(r));
  // if (doc.spaces) each(doc.spaces, (s) => each(s.resources, (r) => purgeInResource(r)));
};

// Return the aggregate function for a given metric
const aggrfn = (metrics, metric) => filter(metrics, (m) => m.name === metric)[0].aggregatefn;

const maxAge = process.env.RESULTS_CACHE_MAX_AGE ? parseInt(process.env.RESULTS_CACHE_MAX_AGE) : 120000;

const lruOpts = {
  max: 100,
  maxAge: maxAge
};

const functionCache = lrucache(lruOpts);

const aggregateHashFunction = (aggregator, previous, current, aggCell, accCell) =>
  `${JSON.stringify(aggregator)}${JSON.stringify(previous)}${JSON.stringify(current)}`;

const aggregationFunction = (meteringPlanId, metrics, metricName) => {
  const aggregationFnKey = `${meteringPlanId}${metricName}aggrFn`;

  let aggregationFn = functionCache.get(aggregationFnKey);
  if (!aggregationFn) {
    aggregationFn = lrucache.memoize(aggrfn(metrics, metricName), aggregateHashFunction, lruOpts);
    functionCache.set(aggregationFnKey, aggregationFn);
  }
  return aggregationFn;
};

const getSpace = (orgDoc, usageDoc) => {
  const spaceId = usageDoc.space_id;
  const f = filter(orgDoc.spaces, (s) => s.space_id === spaceId);
  if (f.length) {
    // remove the space from the org document
    orgDoc.spaces.splice(orgDoc.spaces.indexOf(f[0]), 1);
    return reviveSpace(extend(JSON.parse(JSON.stringify(f[0]), {
      start: usageDoc.start,
      end: usageDoc.end,
      organization_id: usageDoc.organization_id
    })));
  }
  return newSpace(spaceId);
};

const isQuantity = (quantity) => {
  return !isNaN(quantity) && !isUndefined(quantity) && !isNull(quantity);
};

// Aggregate usage and return new aggregated usage
const aggregate = function*(aggrs, usage) {
  debug('Aggregating usage %o from %d and new usage %o from %d',
    aggrs[0], aggrs[0] ? aggrs[0].end : 0, usage, usage.end);

  // Aggregate usage into two docs, the first one contains usage at the
  // org level, the second one contains usage at the consumer level
  const a = aggrs[0];
  const c = aggrs[1];
  const s = aggrs[2];

  const meteringPlanId = usage.metering_plan_id;

  // Retrieve the metering plan and rating plan
  const mplan = yield mconfig(meteringPlanId, systemToken && systemToken());

  const e = mplan.error;
  if (e) {
    debug('The usage submitted has business errors %o', e);
    return [extend({}, usage, mplan)];
  }

  // Compute the aggregated usage time and new usage time
  const newend = usage.processed;
  const docend = usage.end;

  // Deep clone and revive the org aggregated usage object behavior
  const newa = a
    ? extend(reviveOrg(JSON.parse(JSON.stringify(a))), {
      account_id: usage.account_id,
      start: usage.start,
      end: usage.end,
      resource_instance_id: usage.resource_instance_id,
      consumer_id: usage.consumer_id,
      resource_id: usage.resource_id,
      plan_id: usage.plan_id,
      pricing_country: usage.pricing_country,
      prices: usage.prices
    })
    : extend(newOrg(usage.organization_id), {
      account_id: usage.account_id,
      start: usage.start,
      end: usage.end,
      resource_instance_id: usage.resource_instance_id,
      consumer_id: usage.consumer_id,
      resource_id: usage.resource_id,
      plan_id: usage.plan_id,
      pricing_country: usage.pricing_country,
      prices: usage.prices
    });
  const newc = c ? reviveCon(JSON.parse(JSON.stringify(c))) : newConsumer(usage.consumer_id || 'UNKNOWN');
  extend(newc, {
    start: usage.start,
    end: usage.end,
    organization_id: usage.organization_id,
    resource_instance_id: usage.resource_instance_id,
    resource_id: usage.resource_id,
    plan_id: usage.plan_id,
    pricing_country: usage.pricing_country,
    prices: usage.prices
  });
  const news = s ? reviveSpace(JSON.parse(JSON.stringify(s))) : getSpace(newa, usage);
  extend(news, {
    start: usage.start,
    end: usage.end,
    organization_id: usage.organization_id
  });
  // An empty doc only used to detect duplicate usage
  const iddoc = {};

  timewindow.shift(newa, a, usage.processed);
  timewindow.shift(newc, c, usage.processed);
  timewindow.shift(news, s, usage.processed);
  purgeOldQuantities(newa);
  purgeOldQuantities(newc);
  purgeOldQuantities(news);

  newa.space(usage.space_id, seqid.sample(usage.processed_id, sampling));

  // Go through the incoming accumulated usage metrics
  each(usage.accumulated_usage, (accumulatedUsage) => {
    const metricName = accumulatedUsage.metric;
    const aggregationFn = aggregationFunction(meteringPlanId, mplan.metering_plan.metrics, metricName);

    // getCell on incoming usage's time windows
    const accGetCell = timewindow.cellfn(accumulatedUsage.windows, newend, docend);

    const aggr = (am) => {
      // getCell on previous aggregated usage's time windows
      const aggGetCell = timewindow.cellfn(am.windows, newend, docend);
      // We're mutating the input windows property here
      // but it's really the simplest way to apply the aggregation formula
      am.windows = map(am.windows, (window, i) => {
        if (!timewindow.isDimensionSupported(timewindow.dimensions[i]))
          return [null];

        // If the number of slack windows in the aggregated usage is less than
        // the number in the incoming accumulated usage, push until they equal
        if (window.length < accumulatedUsage.windows[i].length)
          each(Array(accumulatedUsage.windows[i].length - window.length), () => window.push(null));

        const twi = timewindow.timeWindowIndex(window, newend, docend, timewindow.dimensions[i]);

        /* eslint complexity: [1, 6] */
        return map(window, (slot, slotIndex) => {
          // Instead of returning undefined or null, returning previously aggregated quantity
          // TODO: Calculation has to use slack window to determine what to do here
          if (!accumulatedUsage.windows[i][slotIndex] || twi !== slotIndex)
            return slot;

          const newQuantity = aggregationFn(
            (slot && slot.quantity) || 0,
            accumulatedUsage.windows[i][slotIndex].quantity.previous || 0,
            accumulatedUsage.windows[i][slotIndex].quantity.current,
            aggGetCell,
            accGetCell
          );

          // Throw error on: NaN, undefined and null results with previous aggregation
          if (slot && slot.quantity && !isQuantity(newQuantity)) {
            const msg = 'Aggregation resulted in invalid value: ' + newQuantity;
            edebug(msg);
            throw extend(new Error(msg), {
              status: 422
            });
          }
          return {
            quantity: newQuantity,
            previous_quantity: slot && slot.quantity ? slot.quantity : null
          };
        });
      });
    };

    // Apply the aggregate function to the aggregated usage tree
    const pid = [usage.plan_id, usage.metering_plan_id, usage.rating_plan_id, usage.pricing_plan_id].join('/');

    aggr(
      newa
        .resource(usage.resource_id)
        .plan(pid)
        .metric(metricName)
    );

    aggr(
      news
        .resource(usage.resource_id)
        .plan(pid)
        .metric(metricName)
    );

    // Apply the aggregate function to the consumer usage tree
    news.consumer(usage.consumer_id || 'UNKNOWN', seqid.sample(usage.processed_id, sampling));
    aggr(
      newc
        .resource(usage.resource_id)
        .plan(pid)
        .metric(metricName)
    );

    newc
      .resource(usage.resource_id)
      .plan(pid)
      .resource_instance(usage.resource_instance_id, dbclient.t(usage.accumulated_usage_id), usage.processed);

  });


  timewindow.shift(newa, usage, parseInt(usage.processed_id));
  timewindow.shift(newc, usage, parseInt(usage.processed_id));
  timewindow.shift(news, usage, parseInt(usage.processed_id));

  // Remove aggregated usage object behavior and return
  const jsa = JSON.parse(JSON.stringify([newa, newc, news, iddoc]));
  debug('New aggregated usage %o', jsa);
  return jsa;
};

// Create an aggregator service app
const aggregator = (token) => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured()) app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const reducer = dataflow.reducer(aggregate, createDataflowReducerConfig(secured(), sampling, token));

  app.use(reducer);
  app.use(router.batch(app));

  app.reducer = reducer;
  return app;
};

const startApp = (token) => {
  const app = aggregator(token);
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
module.exports = aggregator;
module.exports.aggregate = aggregate;
module.exports.newOrg = newOrg;
module.exports.reviveOrg = reviveOrg;
module.exports.runCLI = runCLI;
