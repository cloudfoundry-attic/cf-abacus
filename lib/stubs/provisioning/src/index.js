'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time (and can retrieve and validate info about provisioned
// resources after they've been deleted).

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const schemas = require('abacus-usage-schemas');
const urienv = require('abacus-urienv');
const dbclient = require('abacus-dbclient');
const partition = require('abacus-partition');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');

const pick = _.pick;
const extend = _.extend;

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-stub');

const uris = urienv({
  couchdb: 5984
});

// Compose the URI of a db from the db server URI and the db name
const dburi = (dbserver, name) => [dbserver, name].join('/');

// Forward all data to one bucket
const forward = () => (b, p, o, cb) => {
  return cb(undefined, [
    [0, 0]
  ]);
};

// Always return epoch
const period = (t) => {
  const d = new Date(0);
  return d.getUTCFullYear() * 10000 +
    (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

const dbpartition = () => partition.partitioner(
  partition.bucket, period, forward(), partition.balance);

// Configure acculuate usage log db
const resourceDb = yieldable(retry(breaker(batch(
  dbclient(dbpartition(), dbclient.dburi(dburi(uris.couchdb,
     'abacus-resources')
))))));

// Create an express router
const routes = router();

// Onbard new resource definition
const newResourceDefinition = function * (rid, time, definition) {
  debug('Inserting new resource definition with id %s active from %s',
    rid, time);
  const id = dbclient.kturi('resourcedefinition/' + rid , time);
  yield resourceDb.put(extend({}, definition, {
    _id: id }));
};

// Attempts to find a resource definition at a given point in time. If resource
// definition is not found, the definition is loaded from the resources
// directory. Also it is persisted in the database with effective date.
const config = function * (rid, time) {
  debug('Finding resource definition for resource id %s at time %s', rid, time);
  try {
    const options = {
      startkey:  dbclient.kturi('resourcedefinition/' + rid , time),
      endkey: dbclient.kturi('resourcedefinition/' + rid , 0),
      descending: true,
      limit: 1,
      include_docs:true
    };
    let doc = yield resourceDb.allDocs(options);
    debug(doc);
    if(doc && doc.rows && doc.rows.length === 1) {
      debug('Found resource definition %o', doc);
      doc = doc.rows[0].doc;
      doc = dbclient.undbify(doc);
    }
    else {
      debug('No resource definition found for id %s at time %s in database',
        rid, time);
      debug('Looking for resource definition with id %s ' +
        'in the resources directory', rid);
      doc = require('./resources/' + rid);
      schemas.resourceConfig.validate(doc);
      // Fails when a resource definition is inserted for the second time.
      yield newResourceDefinition(rid, doc.effective, doc);
      if(doc.effective > time)
        doc = null;
    }
    return doc;
  }
  catch(e) {
    debug(e);
    return undefined;
  }
};

// Validate that the given ids are all valid and represent a valid path to
// a resource instance (for example that the given app is or was bound at some
// point to that particular instance) and return provisioning information
// for that resource instance
routes.get(
  '/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/' +
  ':consumer_id/resources/:resource_id/plans/:plan_id/instances/' +
  ':resource_instance_id/:time', function *(req) {
    const path = extend(pick(req.params,
      'region', 'org_id', 'space_id', 'consumer_id',
      'resource_id', 'plan_id', 'resource_instance_id'), {
        time: parseInt(req.params.time)
      });
    debug('Retrieving info for resource instance %o', path);

    // This is a stub here so we only validate the resource_id. A complete
    // implementation of this service should validate all the other
    // parameters
    if(!(yield config(req.params.resource_id, parseInt(req.params.time))))
      return {
        status: 404
      };

    return {
      status: 200,
      body: path
    };
  });

// Return the resource configuration for a particular resource id and
// effective time (allowing evolution of configurations over time, where
// different versions of a resource configuration will be used at different
// points in time)
routes.get(
  '/v1/provisioning/resources/:resource_id/config/:time', function *(req) {
    debug('Retrieving resource config %s at time %d',
      req.params.resource_id, req.params.time);

    // This is a stub here so we just return our sample resource configs
    let conf = yield config(req.params.resource_id, parseInt(req.params.time));
    if(!conf)
      return {
        status: 404
      };

    return {
      status: 200,
      body: conf
    };
  });

// Create a new resource definition valid from the time at which it is posted
// through the api. The effective field is required, but ignored. 
routes.post(
    '/v1/provisioning/resources/:resource_id', function *(req) {
      const d = new Date();
      debug('Creating resource definition with resource id %s at time %d',
        req.params.resource_id, d.getTime());
      schemas.resourceConfig.validate(req.body);
      yield newResourceDefinition(req.params.resource_id,
        d.getTime(), req.body);
      return {
        status: 204
      };
    });

// Create a provisisioning stub app
const provisioning = () => {
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the app and listen
const runCLI = () => provisioning().listen();

// Export our public functions
module.exports = provisioning;
module.exports.runCLI = runCLI;
