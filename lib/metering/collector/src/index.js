'use strict';

// Usage collector service, responsible for receiving usage data batches
// submitted by service providers and storing them in the usage db.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const seqid = require('abacus-seqid');
const transform = require('abacus-transform');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');
const dataflow = require('abacus-dataflow');
const oauth = require('abacus-cfoauth');

const extend = _.extend;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-collector');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Resolve service URIs
const uris = urienv({
  provisioning: 9380,
  meter: 9081
});

// Return the keys and times of our docs
const ikey = (udoc) => 'provider';
const itime = (udoc) => seqid();
const okey = (udoc) => udoc.organization_id;
const otime = (udoc) => seqid();

// Map submitted resource usage doc to normalized usage docs
const normalizeUsage = function *(udoc) {
  debug('Normalizing usage %o', udoc);

  // Validate the given region/org/space/consumer/resource/resource_instances
  yield tmap(udoc.usage, function *(u) {
    return yield brequest.get(uris.provisioning +
      '/v1/provisioning/regions/:region/orgs/:organization_id/spaces/' +
      ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
      ':plan_id/instances/:resource_instance_id',
      extend({}, u, {
        cache: true,
        consumer_id: u.consumer ? u.consumer.consumer_id : 'ALL'
      }));
  });

  // Return the individual usage docs
  return udoc.usage;
};

// Create a collector Webapp
const collector = () => {
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const mapper = dataflow.mapper(normalizeUsage, {
    input: {
      type: 'collected_usage',
      schema: schemas.resourceUsage,
      post: '/v1/metering/collected/usage',
      get: '/v1/metering/collected/usage/t/:t/k/:k',
      dbname: 'abacus-collected-usage',
      key: ikey,
      time: itime
    },
    output: {
      type: 'normalized_usage',
      get: '/v1/metering/normalized/usage/t/:t/k/:k',
      dbname: 'abacus-normalized-usage',
      key: okey,
      time: otime
    },
    sink: {
      host: uris.meter,
      post: '/v1/metering/normalized/usage'
    }
  });

  app.use(mapper);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the collector app and listen
const runCLI = () => collector().listen();

// Export our public functions
module.exports = collector;
module.exports.runCLI = runCLI;
