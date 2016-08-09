'use strict';

// Usage meter service, responsible for applying the configured metering
// functions to usage submitted by resource providers.

const _ = require('underscore');
const router = require('abacus-router');
const cluster = require('abacus-cluster');
const webapp = require('abacus-webapp');
const urienv = require('abacus-urienv');
const mconfigcb = require('abacus-metering-config');
const yieldable = require('abacus-yieldable');
const dataflow = require('abacus-dataflow');
const oauth = require('abacus-oauth');
const seqid = require('abacus-seqid');

const map = _.map;
const extend = _.extend;
const object = _.object;

const mconfig = yieldable(mconfigcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-meter');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  accumulator: 9200
});

// Return OAuth system scopes needed to write input docs
const iwscope = (udoc) => secured() ? {
  system: ['abacus.usage.write']
} : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = (udoc) => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return the keys and times of our docs
const ikey = (udoc) =>
  [udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/');

const itime = (udoc) =>
  seqid();

const okeys = (udoc) =>
  [[udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/')];

const skeys = (udoc) =>
  [[udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id, udoc.metering_plan_id,
    udoc.rating_plan_id, udoc.pricing_plan_id].join('/')];

const otimes = (udoc, itime) =>
  [map([udoc.end, udoc.start], seqid.pad16).join('/')];

const stimes = (udoc, itime) =>
  otimes(udoc, itime);

// Convert measured usage to the format expected by the meter functions
// ex: [{measure: 'm1', quantity: 1}] will be mapped to [{ m1: 1}]
const measures = (mu) => {
  return object(map(mu, (m) => [m.measure, m.quantity]));
};

// Apply the configured meter functions to the given usage
const meterUsage = function *(udoc, auth) {
  debug('Usage %o', udoc);

  // Translate the measured_usage to the measures object expected by
  // the meter function
  const ms = extend({}, measures(udoc.measured_usage), {
    start: udoc.start,
    end: udoc.end
  });

  // Retrieve the metering plan
  const mplan = yield mconfig(udoc.metering_plan_id,
    systemToken && systemToken());

  // Apply the configured meter functions to the measured usage to
  // produce metered usage when there is no error. Otherwise, add
  // error and reasons
  const mudoc = extend({}, udoc, !mplan.error ? {
    metered_usage: map(mplan ? mplan.metering_plan.metrics : [], (m) => ({
      metric: m.name,
      quantity: m.meterfn(ms)
    }))
  } : mplan);

  debug('Metered usage %o', mudoc);
  return [mudoc];
};

// Create a metering service app
const metering = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // metering requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const mapper = dataflow.mapper(meterUsage, {
    input: {
      type: 'normalized_usage',
      post: '/v1/metering/normalized/usage',
      get: '/v1/metering/normalized/usage' + 
        '/t/:tseq/k/:korganization_id/:kresource_instance_id' +
        '/:kconsumer_id/:kplan_id',
      dbname: 'abacus-meter-normalized-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime
    },
    output: {
      type: 'metered_usage',
      get: '/v1/metering/metered/usage' +
        '/k/:korganization_id/:kresource_instance_id' +
        '/:kconsumer_id/:kplan_id' +
        '/t/:tend/:tstart',
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
      authentication: systemToken
    }
  });

  app.use(mapper);
  app.use(router.batch(app));

  app.mapper = mapper;
  return app;
};

// Command line interface, create the meter  app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  // Create the app, replay any failed events, and listen
  const app = metering();
  dataflow.replay(app.mapper, 0, () => {
    app.listen();
  });
};

// exports
module.exports = metering;
module.exports.runCLI = runCLI;

