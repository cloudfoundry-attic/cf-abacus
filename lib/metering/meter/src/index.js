'use strict';

// Usage meter service, responsible for applying the configured metering
// functions to usage submitted by resource providers.

const _ = require('underscore');
const router = require('abacus-router');
const webapp = require('abacus-webapp');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
const configcb = require('abacus-resource-config');
const yieldable = require('abacus-yieldable');
const dataflow = require('abacus-dataflow');
const oauth = require('abacus-cfoauth');

const map = _.map;
const extend = _.extend;
const object = _.object;

const config = yieldable(configcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-meter');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Resolve service URIs
const uris = urienv({
  accumulator: 9100
});

// Return OAuth admin scopes needed to write input docs
const iwscope = (udoc) => secured() ? {
  system: ['abacus.usage.write']
} : undefined;

// Return OAuth admin scopes needed to read input and output docs
const rscope = (udoc) => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return the keys and times of our docs
const ikey = (udoc) => 'provider';
const itime = (udoc) => seqid();
const okey = (udoc) =>
  [udoc.organization_id, udoc.resource_instance_id].join('/');
const otime = (u) => seqid();

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

  // Retrieve the configured resource metrics
  const conf = yield config(udoc.resource_id, udoc.end, auth);

  // Apply the configured meter functions to the measured usage to
  // produce metered usage
  const mudoc = extend({}, udoc, {
    metered_usage: map(conf.metrics, (m) => ({
      metric: m.name,
      quantity: m.meterfn(ms)
    }))
  });

  debug('Metered usage %o', mudoc);
  return [mudoc];
};

// Perform recovery logic when the application starts
const recover = () => {
  // Process any unprocessed docs from our input db

  // TODO insert our recovery logic here
};

// Create a meter app
const meterapp = () => {
  // Perform recovery if needed
  recover();

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
      get: '/v1/metering/normalized/usage/t/:t/k/:k',
      dbname: 'abacus-meter-normalized-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime
    },
    output: {
      type: 'metered_usage',
      get: '/v1/metering/metered/usage/t/:t' +
        '/k/:korganization_id/:kresource_instance_id',
      dbname: 'abacus-meter-metered-usage',
      rscope: rscope,
      key: okey,
      time: otime
    },
    sink : {
      host: uris.accumulator,
      post: '/v1/metering/metered/usage'
    }
  });

  app.use(mapper);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the meter  app and listen
const runCLI = () => meterapp().listen();

// exports
module.exports = meterapp;
module.exports.runCLI = runCLI;

