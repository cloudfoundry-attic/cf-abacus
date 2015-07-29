'use strict';

// Usage collector service, responsible for receiving usage data batches
// submitted by service providers and storing them in the usage db.

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const router = require('cf-abacus-router');
const dbclient = require('cf-abacus-dbclient');
const batch = require('cf-abacus-batch');
const retry = require('cf-abacus-retry');
const breaker = require('cf-abacus-breaker');
const yieldable = require('cf-abacus-yieldable');
const throttle = require('cf-abacus-throttle');
const seqid = require('cf-abacus-seqid');
const transform = require('cf-abacus-transform');
const request = require('cf-abacus-request');
const urienv = require('cf-abacus-urienv');
const db = require('cf-abacus-metering-db');
const schemas = require('cf-abacus-metering-schemas');

const extend = _.extend;
const omit = _.omit;
const map = _.map;
const clone = _.clone;
const flatten = _.flatten;

const tmap = yieldable(transform.map);

const brequest = batch(request);
const get = yieldable(retry(breaker(brequest.get)));
const post = yieldable(retry(breaker(brequest.noWaitPost)));

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-usage-collector');

// Resolve service URIs
const uris = urienv({ couchdb: 5984, meter: 9081, provisioning: 9380 });

// Configure dbs for submitted and normalized usage
const submitdb = yieldable(retry(breaker(batch(db(uris.couchdb, 'abacus-submitted-usage')))));
const normdb = yieldable(retry(breaker(batch(db(uris.couchdb, 'abacus-normalized-usage')))));

// Return a doc location given a route template and params
const loc = (req, template, parms) => req.protocol + '://' + req.headers.host + request.route(template, parms);

// Convert a batch of usage data for a service to individual usage docs
const splitServiceUsage = (batch) => {
    return flatten(map(batch.service_instances, (si) => {
        return map(si.usage, (u) => {
            const cu = clone(u);
            cu.usage_batch_id = batch.id;
            cu.service_id = batch.service_id;
            cu.service_instance_id = si.service_instance_id;
            return cu;
        });
    }), true);
};

// Convert a batch of usage data for a service instance to individual usage
// docs
const splitServiceInstanceUsage = (batch) => {
    return map(batch.usage, (u) => {
        const cu = clone(u);
        cu.usage_batch_id = batch.id;
        cu.service_id = batch.service_id;
        cu.service_instance_id = batch.service_instance_id;
        return cu;
    });
};

// Store a batch of usage data for the given service
const storeServiceUsage = function *(sid, ubatch, region) {
    debug('Received service usage batch for service %s %o', sid, ubatch);

    // Validate the input doc
    schemas.serviceUsage.validate(ubatch);

    // Add optional region to the usage elements
    map(ubatch.service_instances, (si) => map(si.usage, (u) => extend(u, { region: u.region ? u.region : 'us' })));

    // Validate the given region/org/space/consumer/service/service_instances
    yield tmap(ubatch.service_instances, function *(si) {
        yield tmap(si.usage, function *(v) {
            return yield get(uris.provisioning +
                '/v1/provisioning/regions/:region/orgs/:organization_guid/spaces/:space_guid/consumers/:consumer_id/services/:service_id/plans/:plan_id/instances/:service_instance_id',
                extend(clone(v), { cache: true,
                    consumer_id: v.consumer ? v.consumer.value : 'all',
                    service_id: sid, service_instance_id: si.service_instance_id }));
        });
    });

    // Log the usage batch
    const bid = dbclient.tkuri(sid, seqid());
    const bdoc = extend(clone(ubatch), { id: bid, service_id: sid });
    yield submitdb.put(extend(clone(bdoc), { _id: bid }));
    debug('Logged service usage batch %o', bdoc);

    // Split service usage batch into individual usage docs
    const ulist = splitServiceUsage(bdoc);

    // Store the individual usage docs
    const ids = yield tmap(ulist, function *(u) {
        const id = dbclient.tkuri(u.organization_guid, seqid());
        const doc = extend(clone(u), { id: id });
        yield normdb.put(extend(clone(doc), { _id: id }));
        debug('Logged normalized service usage %o', doc);

        // Post to the meter service
        yield post(uris.meter + '/v1/metering/usage', { body: doc });
        return id;
    });

    return { batch_id: bid, ids: ids };
};

// Store a batch of usage data for the given service instance
const storeServiceInstanceUsage = function *(siid, ubatch, region) {
    debug('Received service instance usage batch for service instance %s %o', siid, ubatch);
    // Validate the input doc
    schemas.serviceInstanceUsage.validate(ubatch);

    // Add optional region to the usage elements
    map(ubatch.usage, (u) => extend(u, { region: u.region ? u.region : 'us' }));

    // Validate the given region/org/space/consumer/service/service_instances
    yield tmap(ubatch.usage, function *(v) {
        return yield get(uris.provisioning +
            '/v1/provisioning/regions/:region/orgs/:organization_guid/spaces/:space_guid/consumers/:consumer_id/services/:service_id/plans/:plan_id/instances/:service_instance_id',
            extend(clone(v), { cache: true,
                consumer_id: v.consumer ? v.consumer.value : 'all',
                service_id: ubatch.service_id, service_instance_id: siid }));
    });

    // Log the usage batch
    const bid = dbclient.tkuri(ubatch.service_id, seqid());
    const bdoc = extend(clone(ubatch), { id: bid, service_instance_id: siid });
    yield submitdb.put(extend(clone(bdoc), { _id: bid }));
    debug('Logged service instance usage batch %o', bdoc);

    // Split service instance usage batch into individual usage docs
    const ulist = splitServiceInstanceUsage(ubatch);

    // Store the individual usage docs
    const ids = yield tmap(ulist, function *(u) {
        const id = dbclient.tkuri(u.organization_guid, seqid());
        const doc = extend(clone(u), { id: id });
        yield normdb.put(extend(clone(doc), { _id: id }));
        debug('Logged normalized service instance usage %o', doc);

        // Post to the meter service
        yield post(uris.meter + '/v1/metering/usage', doc);
        return id;
    });

    return { batch_id: bid, ids: ids };
};

// Create an express router
const routes = router();

// Store a batch of usage data for the given service
routes.post('/v1/metering/services/:service_id/usage', throttle(function *(req) {
    const ids = yield storeServiceUsage(req.params.service_id, req.body, req.query.region);
    return { statusCode: 201,
        header: { Location: loc(req, '/v1/metering/services/:service_id/usage/:id', extend({ id: ids.batch_id }, req.params)) },
        body: map(ids.ids, (id) => loc(req, '/v1/metering/usage/:id', { id: id }))
    };
}));

// Store a batch of usage data for the given service instance
routes.post('/v1/metering/service_instances/:service_instance_id/usage', throttle(function *(req) {
    const ids = yield storeServiceInstanceUsage(req.params.service_instance_id, req.body, req.query.region);
    return { statusCode: 201,
        header: { Location: loc(req, '/v1/metering/service_instances/:service_instance_id/usage/:id', extend({ id: ids.batch_id }, req.params)) },
        body: map(ids.ids, (id) => loc(req, '/v1/metering/usage/:id', { id: id }))
    };
}));

// Retrieve a batch of usage data for the given service
routes.get('/v1/metering/services/:service_id/usage/:id', throttle(function *(req) {
    debug('Retrieving usage batch for service %s id %s', req.params.service_id, req.params.id);
    const doc = omit(yield submitdb.get(req.params.id), ['_id', '_rev', 'service_id']);
    return { body: doc };
}));

// Retrieve a batch of usage data for the given service instance
routes.get('/v1/metering/service_instances/:service_instance_id/usage/:id', throttle(function *(req) {
    debug('Retrieving usage batch for service instance %s id %s', req.params.service_instance_id, req.params.id);
    const doc = omit(yield submitdb.get(req.params.id), ['_id', '_rev', 'service_instance_id']);
    return { body: doc };
}));

// Retrieve an individual normalized usage doc
routes.get('/v1/metering/usage/:id', throttle(function *(req) {
    debug('Retrieving usage for id %s', req.params.id);
    const doc = omit(yield normdb.get(req.params.id), ['_id', '_rev']);
    return { body: doc };
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

