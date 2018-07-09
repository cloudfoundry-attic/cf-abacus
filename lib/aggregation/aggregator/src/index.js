'use strict';

const { each, extend, filter, find, map, isNaN, isNull, isUndefined } = require('underscore');

const cluster = require('abacus-cluster');
const dataflow = require('abacus-dataflow');
const dbclient = require('abacus-dbclient');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const lrucache = require('abacus-lrucache');
const mconfigcb = require('abacus-metering-config');
const oauth = require('abacus-oauth');
const rconfigcb = require('abacus-rating-config');
const timewindow = require('abacus-timewindow');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');

const { newOrg, newSpace, newConsumer, reviveOrg, reviveSpace, reviveCon } = require('./lib/models');

const mconfig = yieldable(mconfigcb);
const rconfig = yieldable(rconfigcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');
const edebug = require('abacus-debug')('e-abacus-usage-aggregator');

let systemToken;

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  sink: undefined
});

// Return OAuth system scopes needed to write input docs
const iwscope = (udoc) =>
  secured()
    ? { system: ['abacus.usage.write'] }
    : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = (udoc) =>
  secured()
    ? { system: ['abacus.usage.read'] }
    : undefined;

// Return the keys and times of our docs
const ikey = (udoc) => udoc.organization_id;

const itime = (udoc) => seqid();

const igroups = (udoc) => [
  udoc.organization_id,
  [udoc.organization_id, udoc.space_id, udoc.consumer_id || 'UNKNOWN'].join('/'),
  [udoc.organization_id, udoc.space_id].join('/'),
  [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.plan_id,
    udoc.metering_plan_id,
    udoc.rating_plan_id,
    udoc.pricing_plan_id
  ].join('/')
];

const okeys = (udoc, ikey) => [
  udoc.organization_id,
  [udoc.organization_id, udoc.space_id, udoc.consumer_id || 'UNKNOWN'].join('/'),
  [udoc.organization_id, udoc.space_id].join('/'),
  [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.plan_id,
    udoc.metering_plan_id,
    udoc.rating_plan_id,
    udoc.pricing_plan_id
  ].join('/')
];

const skeys = (udoc) => [udoc.account_id, udoc.account_id, undefined];

// Configure reduction result doc sampling, to store reduction results
// in a single doc per min, hour or day for example instead of creating
// a new doc for each new result
const sampling = process.env.SAMPLING;

const otimes = (udoc, itime) => [
  seqid.sample(itime, sampling),
  seqid.sample(itime, sampling),
  seqid.sample(itime, sampling),
  map([udoc.end, udoc.start], seqid.pad16).join('/')
];

const stimes = (udoc, itime) => [seqid.sample(itime, sampling), undefined];

// find info with error and reason to redirect
// usage to error db and stop processing it to the next pipeline.
const findError = (info) => find(info, (i) => i.error);

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

// Return the configured price for the metrics that is attached in the usage document
const price = (pricings, metric) => filter(pricings, (m) => m.name === metric)[0].price;

// Return the rate function for a given metric
const ratefn = (metrics, metric) => filter(metrics, (m) => m.name === metric)[0].ratefn;

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
const rateHashFunction = (metricPrice, quantity) => `${metricPrice}${JSON.stringify(quantity)}`;

const aggregationFunction = (meteringPlanId, metrics, metricName) => {
  const aggregationFnKey = `${meteringPlanId}${metricName}aggrFn`;

  let aggregationFn = functionCache.get(aggregationFnKey);
  if (!aggregationFn) {
    aggregationFn = lrucache.memoize(aggrfn(metrics, metricName), aggregateHashFunction, lruOpts);
    functionCache.set(aggregationFnKey, aggregationFn);
  }
  return aggregationFn;
};

const rateFunction = (ratingPlanId, metrics, metricName) => {
  const rateFnKey = `${ratingPlanId}${metricName}rateFn`;

  let rateFn = functionCache.get(rateFnKey);
  if (!rateFn) {
    rateFn = lrucache.memoize(ratefn(metrics, metricName), rateHashFunction, lruOpts);
    functionCache.set(rateFnKey, rateFn);
  }
  return rateFn;
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
const aggregate = function*(aggrs, u) {
  debug('Aggregating usage %o from %d and new usage %o from %d', aggrs[0], aggrs[0] ? aggrs[0].end : 0, u, u.end);

  // Aggregate usage into two docs, the first one contains usage at the
  // org level, the second one contains usage at the consumer level
  const a = aggrs[0];
  const c = aggrs[1];
  const s = aggrs[2];

  const meteringPlanId = u.metering_plan_id;
  const ratingPlanId = u.rating_plan_id;

  // Retrieve the metering plan and rating plan
  const [mplan, rplan] = yield [
    mconfig(meteringPlanId, systemToken && systemToken()),
    rconfig(ratingPlanId, systemToken && systemToken())
  ];

  // find errors
  const e = findError([mplan, rplan]);

  if (e) {
    debug('The usage submitted has business errors %o', e);
    return [extend({}, u, e)];
  }

  // Compute the aggregated usage time and new usage time
  const newend = u.processed;
  const docend = u.end;

  // Deep clone and revive the org aggregated usage object behavior
  const newa = a
    ? extend(reviveOrg(JSON.parse(JSON.stringify(a))), {
      account_id: u.account_id,
      start: u.start,
      end: u.end,
      resource_instance_id: u.resource_instance_id,
      consumer_id: u.consumer_id,
      resource_id: u.resource_id,
      plan_id: u.plan_id,
      pricing_country: u.pricing_country,
      prices: u.prices
    })
    : extend(newOrg(u.organization_id), {
      account_id: u.account_id,
      start: u.start,
      end: u.end,
      resource_instance_id: u.resource_instance_id,
      consumer_id: u.consumer_id,
      resource_id: u.resource_id,
      plan_id: u.plan_id,
      pricing_country: u.pricing_country,
      prices: u.prices
    });
  const newc = c ? reviveCon(JSON.parse(JSON.stringify(c))) : newConsumer(u.consumer_id || 'UNKNOWN');
  extend(newc, {
    start: u.start,
    end: u.end,
    organization_id: u.organization_id,
    resource_instance_id: u.resource_instance_id,
    resource_id: u.resource_id,
    plan_id: u.plan_id,
    pricing_country: u.pricing_country,
    prices: u.prices
  });
  const news = s ? reviveSpace(JSON.parse(JSON.stringify(s))) : getSpace(newa, u);
  extend(news, {
    start: u.start,
    end: u.end,
    organization_id: u.organization_id
  });
  // An empty doc only used to detect duplicate usage
  const iddoc = {};

  timewindow.shift(newa, a, u.processed);
  timewindow.shift(newc, c, u.processed);
  timewindow.shift(news, s, u.processed);
  purgeOldQuantities(newa);
  purgeOldQuantities(newc);
  purgeOldQuantities(news);

  newa.space(u.space_id, seqid.sample(u.processed_id, sampling));

  // Go through the incoming accumulated usage metrics
  each(u.accumulated_usage, (accumulatedUsage) => {
    const metricName = accumulatedUsage.metric;
    const aggregationFn = aggregationFunction(meteringPlanId, mplan.metering_plan.metrics, metricName);
    const metricPrice = price(u.prices.metrics, metricName);
    const rateFn = rateFunction(ratingPlanId, rplan.rating_plan.metrics, metricName);

    // getCell on incoming usage's time windows
    const accGetCell = timewindow.cellfn(accumulatedUsage.windows, newend, docend);

    const aggr = (am) => {
      // getCell on previous aggregated usage's time windows
      const aggGetCell = timewindow.cellfn(am.windows, newend, docend);
      // We're mutating the input windows property here
      // but it's really the simplest way to apply the aggregation formula
      am.windows = map(am.windows, (w, i) => {
        if (!timewindow.isDimensionSupported(timewindow.dimensions[i]))
          return [null];

        // If the number of slack windows in the aggregated usage is less than
        // the number in the incoming accumulated usage, push until they equal
        if (w.length < accumulatedUsage.windows[i].length)
          each(Array(accumulatedUsage.windows[i].length - w.length), () => w.push(null));

        const twi = timewindow.timeWindowIndex(w, newend, docend, timewindow.dimensions[i]);

        /* eslint complexity: [1, 6] */
        const quantities = map(w, (q, j) => {
          // Instead of returning undefined or null, returning previously aggregated quantity
          // TODO: Calculation has to use slack window to determine what to do here
          if (!accumulatedUsage.windows[i][j] || twi !== j)
            return q;

          const newQuantity = aggregationFn(
            (q && q.quantity) || 0,
            accumulatedUsage.windows[i][j].quantity.previous || 0,
            accumulatedUsage.windows[i][j].quantity.current,
            aggGetCell,
            accGetCell
          );

          // Throw error on: NaN, undefined and null results with previous aggregation
          if (q && q.quantity && !isQuantity(newQuantity)) {
            const msg = 'Aggregation resulted in invalid value: ' + newQuantity;
            edebug(msg);
            throw extend(new Error(msg), {
              status: 422
            });
          }
          return {
            quantity: newQuantity,
            previous_quantity: q && q.quantity ? q.quantity : null
          };
        });

        return map(quantities, (q) =>
          q
            ? extend(q, { cost: q.quantity ? rateFn(metricPrice, q.quantity) : 0 })
            : null
        );
      });
    };

    // Apply the aggregate function to the aggregated usage tree
    const pid = [u.plan_id, u.metering_plan_id, u.rating_plan_id, u.pricing_plan_id].join('/');

    aggr(
      newa
        .resource(u.resource_id)
        .plan(pid)
        .metric(metricName)
    );

    aggr(
      news
        .resource(u.resource_id)
        .plan(pid)
        .metric(metricName)
    );

    // Apply the aggregate function to the consumer usage tree
    news.consumer(u.consumer_id || 'UNKNOWN', seqid.sample(u.processed_id, sampling));
    aggr(
      newc
        .resource(u.resource_id)
        .plan(pid)
        .metric(metricName)
    );

    newc
      .resource(u.resource_id)
      .plan(pid)
      .resource_instance(u.resource_instance_id, dbclient.t(u.accumulated_usage_id), u.processed);

  });


  timewindow.shift(newa, u, parseInt(u.processed_id));
  timewindow.shift(newc, u, parseInt(u.processed_id));
  timewindow.shift(news, u, parseInt(u.processed_id));

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

  const authFn = () => secured() ? token : () => {};

  const reducer = dataflow.reducer(aggregate, {
    input: {
      type: 'accumulated_usage',
      post: '/v1/metering/accumulated/usage',
      get: '/v1/metering/accumulated/usage/t/:tseq/k/:korganization_id',
      dbname: 'abacus-aggregator-accumulated-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime,
      groups: igroups
    },
    output: {
      type: 'aggregated_usage',
      get: '/v1/metering/aggregated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-aggregated-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: process.env.SINK ? uris.sink : undefined,
      apps: process.env.AGGREGATOR_SINK_APPS,
      posts: ['/v1/metering/aggregated/usage', '/v1/metering/aggregated/usage', undefined],
      keys: skeys,
      times: stimes,
      authentication: authFn()
    }
  });

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
