'use strict';

// Usage meter service, responsible for applying the configured metering
// functions to usage submitted by resource providers.

const { extend, object, map } = require('underscore');

const cluster = require('abacus-cluster');
const dataflow = require('abacus-dataflow');
const lrucache = require('abacus-lrucache');
const mconfigcb = require('abacus-metering-config');
const oauth = require('abacus-oauth');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');

const mconfig = yieldable(mconfigcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-meter');
const edebug = require('abacus-debug')('e-abacus-usage-meter');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  accumulator: 9200
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
const ikey = (udoc) => [
  udoc.organization_id, udoc.resource_instance_id, udoc.consumer_id || 'UNKNOWN', udoc.resource_id, udoc.plan_id
].join('/');

const itime = (udoc) => seqid();

const okeys = (udoc) => [
  [
    udoc.organization_id, udoc.resource_instance_id, udoc.consumer_id || 'UNKNOWN', udoc.resource_id, udoc.plan_id
  ].join('/')
];

const skeys = (udoc) => [
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

const otimes = (udoc, itime) => [map([udoc.end, udoc.start], seqid.pad16).join('/')];

const stimes = (udoc, itime) => otimes(udoc, itime);

// Convert measured usage to the format expected by the meter functions
// ex: [{measure: 'm1', quantity: 1}] will be mapped to [{ m1: 1}]
const measures = (mu) => object(map(mu, (m) => [ m.measure, m.quantity ]));

const maxAge = process.env.RESULTS_CACHE_MAX_AGE ? parseInt(process.env.RESULTS_CACHE_MAX_AGE) : 120000;

const lruOpts = {
  max: 100,
  maxAge: maxAge
};

const functionCache = lrucache(lruOpts);

const meterHashFunction = (measures) => `${JSON.stringify(measures)}`;

const meterFunction = (meteringPlanId, metric) => {
  const meterFnKey = `${meteringPlanId}${metric.name}meterFn`;

  let meterFn = functionCache.get(meterFnKey);
  if (!meterFn) {
    meterFn = lrucache.memoize(metric.meterfn, meterHashFunction, lruOpts);
    functionCache.set(meterFnKey, meterFn);
  }
  return meterFn;
};

// Apply the configured meter functions to the given usage
const meterUsage = function*(usageDoc, auth) {
  debug('Usage %o', usageDoc);

  // Translate the measured_usage to the measures object expected by the meter function
  const allMeasures = extend({}, measures(usageDoc.measured_usage), {
    start: usageDoc.start,
    end: usageDoc.end
  });

  const meteringPlanId = usageDoc.metering_plan_id;
  const mplan = yield mconfig(meteringPlanId, systemToken && systemToken());

  // Apply the configured meter functions to the measured usage to
  // produce metered usage when there is no error. Otherwise, add
  // error and reasons
  const meteredUsageDoc = extend(
    {},
    usageDoc,
    !mplan.error
      ? {
        metered_usage: map(mplan ? mplan.metering_plan.metrics : [], (metric) => ({
          metric: metric.name,
          quantity: meterFunction(meteringPlanId, metric)(allMeasures)
        }))
      }
      : mplan
  );

  debug('Metered usage %o', meteredUsageDoc);
  return [meteredUsageDoc];
};

// Create a metering service app
const metering = (token) => {
  // Configure Node cluster to use a single process as we want to serialize
  // metering requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured()) app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const authFn = () => secured() ? token : () => {};

  const mapper = dataflow.mapper(meterUsage, {
    input: {
      type: 'normalized_usage',
      post: '/v1/metering/normalized/usage',
      get: '/v1/metering/normalized/usage/' +
        't/:tseq/' +
        'k/:korganization_id/:kresource_instance_id/:kconsumer_id/:kresource_id/:kplan_id',
      dbname: 'abacus-meter-normalized-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime,
      authentication: authFn()
    },
    output: {
      type: 'metered_usage',
      get: '/v1/metering/metered/usage/' +
        'k/:korganization_id/:kresource_instance_id/:kconsumer_id/:kresource_id/:kplan_id/' +
        't/:tend/:tstart',
      dbname: 'abacus-meter-metered-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.accumulator,
      apps: process.env.ACCUMULATOR_APPS,
      posts: ['/v1/metering/metered/usage'],
      keys: skeys,
      times: stimes,
      authentication: authFn()
    }
  });

  app.use(mapper);
  app.use(router.batch(app));

  app.mapper = mapper;
  return app;
};

const startApp = (token) => {
  const app = metering(token);
  app.listen();

  if (!cluster.isWorker() || cluster.isDisabled()) {
    debug('Starting replay ...');
    dataflow.replay(app.mapper, 0, (err) => {
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

// exports
module.exports = metering;
module.exports.meter = meterUsage;
module.exports.runCLI = runCLI;
