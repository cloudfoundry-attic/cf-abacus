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

const extend = _.extend;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-collector');

// Resolve service URIs
const uris = urienv({
  provisioning: 9380,
  meter: 9081
});

// Return the keys and times of our docs
const ikey = (doc) => 'provider';
const itime = (doc) => seqid();
const okey = (doc) => doc.organization_id;
const otime = (doc) => seqid();

// Map submitted resource usage doc to normalized usage docs
const normalizeUsage = function *(doc) {
  debug('Normalizing usage %o', doc);

  // Validate the given region/org/space/consumer/resource/resource_instances
  yield tmap(doc.usage, function *(u) {
    return yield brequest.get(uris.provisioning +
      '/v1/provisioning/regions/:region/orgs/:organization_id/spaces/' +
      ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
      ':plan_id/instances/:resource_instance_id', extend({}, u, {
        cache: true,
        consumer_id: u.consumer ? u.consumer.consumer_id : 'ALL'
      }));
  });

  // Return the individual usage docs
  return doc.usage;
};

// Create a collector Webapp
const collector = () => {
  const app = webapp();

  const mapper = dataflow.mapper(
    '/collected/usage', schemas.resourceUsage,
    'abacus-collected-usage', ikey, itime,
    normalizeUsage,
    '/normalized/usage', 'abacus-normalized-usage', okey, otime,
    undefined, uris.meter + '/v1/metering');

  app.use('/v1/metering', mapper);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the collector app and listen
const runCLI = () => collector().listen();

// Export our public functions
module.exports = collector;
module.exports.runCLI = runCLI;

