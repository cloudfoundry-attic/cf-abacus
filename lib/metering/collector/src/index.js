'use strict';

// Usage collector service, responsible for receiving usage data batches
// submitted by service providers and storing them in the usage db.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const throttle = require('abacus-throttle');
const seqid = require('abacus-seqid');
const transform = require('abacus-transform');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const db = require('abacus-metering-db');
const schemas = require('abacus-usage-schemas');

const extend = _.extend;
const omit = _.omit;
const map = _.map;
const clone = _.clone;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-collector');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  meter: 9081,
  provisioning: 9380
});

// Configure dbs for submitted and normalized usage
const submitdb = yieldable(retry(breaker(batch(
  db(uris.couchdb, 'abacus-submitted-usage')))));
const normdb = yieldable(retry(breaker(batch(
  db(uris.couchdb, 'abacus-normalized-usage')))));

// Return a doc location given a route template and params
const loc = (req, template, parms) => req.protocol + '://' +
  req.headers.host + request.route(template, parms);

// Convert a batch of usage data to individual usage docs
const splitUsage = (ubatch) => {
  return map(ubatch.usage, (u) => {
    return extend(clone(u), {
      usage_batch_id: ubatch.id
    });
  });
};

// Store a batch of resource usage data
const storeUsage = function *(ubatch) {
  debug('Received resource usage batch %o', ubatch);

  // Validate the input doc
  schemas.resourceUsage.validate(ubatch);

  // Validate the given region/org/space/consumer/service/service_instances
  yield tmap(ubatch.usage, function *(u) {
    return yield brequest.get(uris.provisioning +
      '/v1/provisioning/regions/:region/orgs/:organization_id/spaces/' +
      ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
      ':plan_id/instances/:resource_instance_id', extend(clone(u), {
      cache: true,
      consumer_id: u.consumer ? u.consumer.consumer_id : 'ALL'
    }));
  });

  // Log the usage batch
  // TODO use the service provider id as a key
  const bid = dbclient.tkuri('provider', seqid());
  const bdoc = extend(clone(ubatch), {
    id: bid
  });
  yield submitdb.put(bdoc);
  debug('Logged service usage batch %o', bdoc);

  // Split service usage batch into individual usage docs
  const ulist = splitUsage(bdoc);

  // Store the individual usage docs
  const ids = yield tmap(ulist, function *(u) {
    const id = dbclient.tkuri(u.organization_id, seqid());
    const doc = extend(clone(u), {
      id: id
    });
    yield normdb.put(doc);
    debug('Logged normalized service usage %o', doc);

    // Post usage to the meter service
    yieldable.functioncb(brequest.post)(uris.meter + '/v1/metering/usage', {
      body: doc
    }, (err, res) => {
      if(err) debug('Failed to post %s to metering service, %o', id, err);
    });

    return id;
  });

  return {
    batch_id: bid,
    ids: ids
  };
};

// Create an express router
const routes = router();

// Store a batch of resource usage data
routes.post(
  '/v1/metering/resource/usage', throttle(function *(req) {
    const ids = yield storeUsage(req.body);
    return {
      statusCode: 201,
      header: {
        Location: loc(req, '/v1/metering/resource/usage/:id',
          {
            id: ids.batch_id
          })
      },
      body: map(ids.ids, (id) => loc(req, '/v1/metering/usage/:id', {
          id: id
        }))
    };
  }));

// Retrieve a batch of resource usage data
routes.get(
  '/v1/metering/resource/usage/t/:t/k/:provider', throttle(function *(req) {
    const id = dbclient.tkuri(req.params.provider, req.params.t);
    debug('Retrieving usage batch for id %s', id);
    const doc = omit(yield submitdb.get(id), ['_id', '_rev']);
    return {
      body: doc
    };
  }));

// Retrieve an individual usage data doc
routes.get(
  '/v1/metering/usage/t/:t/k/:organization_id', throttle(function *(req) {
    const id = dbclient.tkuri(req.params.organization_id, req.params.t);
    debug('Retrieving usage for id %s', id);
    const doc = omit(yield normdb.get(id), ['_id', '_rev']);
    return {
      body: doc
    };
  }));

// Create a collector Webapp
const collector = () => {
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the collector app and listen
const runCLI = () => collector().listen();

// Export our public functions
module.exports = collector;
module.exports.runCLI = runCLI;

