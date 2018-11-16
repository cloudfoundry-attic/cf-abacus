'use strict';

// Minimal example implementation of an Abacus provisioning plugin.

// A provisioning plugin provides REST APIs used by the Abacus usage
// processing pipeline to retrieve information about provisioned resources
// and the metering plans which should be used to meter their usage.

// This minimal Abacus provisioning plugin example is provided only for demo
// and test purposes. An integrator of Abacus is expected to replace it with
// a real production implementation.
const fs = require('fs');
const path = require('path');

const { extend, isEmpty, pick } = require('underscore');

const oauth = require('abacus-oauth');
const mappings = require('abacus-plan-mappings');
const router = require('abacus-router');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');

const plansDb = require('./lib/plan-db.js');

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-plugin');
const edebug = require('abacus-debug')('e-abacus-provisioning-plugin');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// Create an express router
const routes = router();

// Return the type of a resource
const rtype = function*(rid) {
  // This is just a minimal example implementation, we simply return the
  // given resource id
  return rid;
};

const writeScope = { system: ['abacus.usage.write'] };
const readScope = { system: ['abacus.usage.read'] };

const upsertPlan = function*(type, plan) {
  if (yield plansDb.read({ cache: false })[type](plan.plan_id))
    yield plansDb.update[type](plan.plan_id, plan);
  else
    yield plansDb.create[type](plan);
};

const storeAllPlansOfType = (type, cb) => {
  const planDir = path.join(__dirname, '/plans/' + type);
  const planFiles = fs.readdirSync(planDir);
  yieldable.functioncb(function*() {
    for(let file in planFiles) {
      const defaultPlan = require(path.join(planDir, planFiles[file]));
      yield upsertPlan(type, defaultPlan);
    }
  })((error) => {
    if(error)
      throw new Error('Failed to store default plan: ' + error);

    debug('Default %s plan mappings created', type);
    cb();
  });
};

const storeAllDefaultPlans = (cb = () => {}) => {
  let callCount = 0;
  const countCb = () => {
    if(++callCount === 3)
      cb();
  };
  const types = ['metering', 'pricing', 'rating'];

  for(let type of types)
    storeAllPlansOfType(type, countCb);
};

const throwUnauthorizedError = (scopes, planId) => {
  edebug('Provided scopes %j are insufficient to access plan: %s', scopes,
    planId);
  throw {
    statusCode: 403,
    header: {
      'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope"'
    }
  };
};

const authorize = (req, scope) => {
  if (secured())
    oauth.authorize(req && req.headers && req.headers.authorization, scope);
};

/* eslint complexity: [1, 7] */
const authorizeReadPlan = (req, planId) => {
  if (!secured()) return;

  const scopes = oauth.parseTokenScope(req && req.headers &&
    req.headers.authorization);
  debug('Extracted scopes: %j', scopes);

  if (scopes.hasSystemReadScope)
    return;

  if (scopes.readResourceScopes.length > 0 &&
    planId.endsWith(scopes.readResourceScopes[0]))
    return;

  throwUnauthorizedError(scopes, planId);
};

/* eslint complexity: [1, 7] */
const authorizeWritePlan = (req, planId) => {
  if (!secured()) return;

  const scopes = oauth.parseTokenScope(req && req.headers &&
    req.headers.authorization);
  debug('Extracted scopes: %j', scopes);

  if (scopes.hasSystemWriteScope)
    return;

  if (scopes.writeResourceScopes.length > 0 &&
    planId.endsWith(scopes.writeResourceScopes[0]))
    return;

  throwUnauthorizedError(scopes, planId);
};

// Validate that the given ids are all valid and represent a valid path to
// a resource instance (for example that the given app is or was bound at some
// point to that particular instance) and return provisioning information
// for that resource instance
routes.get(
  '/v1/provisioning/organizations/:org_id/spaces/:space_id/consumers/' +
  ':consumer_id/resources/:resource_id/plans/:plan_id/instances/' +
  ':resource_instance_id/:time',
  function*(req) {
    authorize(req, readScope);
    const path = extend(pick(req.params, 'org_id', 'space_id', 'consumer_id',
      'resource_id', 'plan_id', 'resource_instance_id'), {
      time: parseInt(req.params.time)
    });
    debug('Retrieving info for resource instance %o', path);

    // This is a plugin here so we only validate the resource and plan ids.
    // A real implementation should validate all the parameters and return
    // either 200 if all parameters are valid or 404 if some of the ids
    // or their combinations are not found
    const id = yield mappings.mappedMeteringPlan(
      yield rtype(req.params.resource_id), req.params.plan_id);
    if(!id) {
      debug('Mapping for resourceId %s and planName %s does not exist',
        req.params.resource_id, req.params.plan_id);
      return {
        status: 404
      };
    }

    const meteringPlan = yield plansDb.read({ cache: false }).metering(id);
    if(!meteringPlan) {
      debug('MeteringPlan for resourceId %s and' +
        'planName %s with id %s not found',
      req.params.resource_id, req.params.plan_id, id);
      return {
        status: 404,
        body: path
      };
    }
    return {
      status: 200,
      body: path
    };
  });

// Return the resource type for the given resource id.
routes.get('/v1/provisioning/resources/:resource_id/type',
  function*(req) {
    debug('Identifying the resource type of %s', req.params.resource_id);
    return {
      status: 200,
      body: yield rtype(req.params.resource_id)
    };
  });

routes.post('/v1/:plan_type/plans',
  function*(req) {
    const planId = req.body.plan_id;
    debug('Creating plan %s', planId);

    if (isEmpty(planId))
      return {
        status: 400
      };

    authorizeWritePlan(req, planId);
    const planType = req.params.plan_type;
    yield plansDb.create[planType](req.body);
    return {
      status: 201
    };
  });

routes.put('/v1/:plan_type/plan/:plan_id',
  function*(req) {
    const bodyPlanId = req.body.plan_id;
    const reqPlanId = req.params.plan_id;

    if (isEmpty(bodyPlanId) || bodyPlanId !== reqPlanId)
      return {
        status: 400
      };

    debug('Updating plan %s', bodyPlanId);
    authorizeWritePlan(req, bodyPlanId);
    const planType = req.params.plan_type;
    yield plansDb.update[planType](bodyPlanId, req.body);
    return {
      status: 200
    };
  });

routes.get('/v1/:plan_type/plans/:plan_id',
  function*(req) {
    const planId = req.params.plan_id;
    debug('Retrieving %s plan %s', req.params.plan_type, planId);
    authorizeReadPlan(req, planId);
    let cacheOpt = true;
    if(req.headers['cache-control'] &&
        req.headers['cache-control'].includes('no-cache'))
      cacheOpt = false;

    const dbReader = plansDb.read({
      cache: cacheOpt
    });

    const plan =
      yield dbReader[req.params.plan_type](req.params.plan_id);

    if(!plan) {
      debug('Plan with id %s of type %s not found',
        req.params.plan_id, req.params.plan_type);
      return {
        status: 404
      };
    }
    return {
      status: 200,
      body: plan
    };
  });

// Map metering (resource_type, plan_name) to plan_id
routes.post(
  '/v1/provisioning/mappings/metering/resources/:resource_type/' +
  'plans/:plan_name/:plan_id',
  function*(req) {
    authorize(req, writeScope);
    debug('Mapping metering (%s, %s) -> %s',
      req.params.resource_type, req.params.plan_name, req.params.plan_id);

    yield mappings.newMeteringMapping(req.params.resource_type,
      req.params.plan_name, req.params.plan_id);
    return {
      status: 200
    };
  });

// Map rating (resource_type, plan_name) to plan_id
routes.post(
  '/v1/provisioning/mappings/rating/resources/:resource_type/' +
  'plans/:plan_name/:plan_id',
  function*(req) {
    debug('Mapping rating (%s, %s) -> %s',
      req.params.resource_type, req.params.plan_name, req.params.plan_id);
    authorize(req, writeScope);

    yield mappings.newRatingMapping(req.params.resource_type,
      req.params.plan_name, req.params.plan_id);
    return {
      status: 200
    };
  });

// Map pricing (resource_type, plan_name) to plan_id
routes.post(
  '/v1/provisioning/mappings/pricing/resources/:resource_type/' +
  'plans/:plan_name/:plan_id',
  function*(req) {
    debug('Mapping pricing (%s, %s) -> %s',
      req.params.resource_type, req.params.plan_name, req.params.plan_id);
    authorize(req, writeScope);

    yield mappings.newPricingMapping(req.params.resource_type,
      req.params.plan_name, req.params.plan_id);
    return {
      status: 200
    };
  });

// Return metering plan id mapped to (resource_type, plan_name)
routes.get(
  '/v1/provisioning/mappings/metering/resources/:resource_type/' +
  'plans/:plan_name/',
  function*(req) {
    debug('Retrieving mapped metering plan id for (%s, %s)',
      req.params.resource_type, req.params.plan_name);
    authorize(req, readScope);

    const meteringPlanId = yield mappings.mappedMeteringPlan(
      req.params.resource_type, req.params.plan_name);

    if(!meteringPlanId) {
      debug('MeteringPlan for resourceType %s and' +
        'planName %s not found',
      req.params.resource_type, req.params.plan_name);
      return {
        status: 404
      };
    }
    return {
      status: 200,
      body: { plan_id: meteringPlanId }
    };
  });

// Return rating plan id mapped to (resource_type, plan_name)
routes.get(
  '/v1/provisioning/mappings/rating/resources/:resource_type/' +
  'plans/:plan_name/',
  function*(req) {
    authorize(req, readScope);
    debug('Retrieving mapped rating plan id for (%s, %s)',
      req.params.resource_type, req.params.plan_name);

    const ratingPlanId = yield mappings.mappedRatingPlan(
      req.params.resource_type, req.params.plan_name);

    if(!ratingPlanId) {
      debug('RatingPlan for resourceType %s and' +
        'planName %s not found',
      req.params.resource_type, req.params.plan_name);
      return {
        status: 404
      };
    }
    return {
      status: 200,
      body: { plan_id: ratingPlanId }
    };
  });

// Return pricing plan id mapped to (resource_type, plan_name)
routes.get(
  '/v1/provisioning/mappings/pricing/resources/:resource_type/' +
  'plans/:plan_name/',
  function*(req) {
    authorize(req, readScope);
    debug('Retrieving mapped pricing plan id for (%s, %s)',
      req.params.resource_type, req.params.plan_name);

    const pricingPlanId = yield mappings.mappedPricingPlan(
      req.params.resource_type, req.params.plan_name);

    if(!pricingPlanId) {
      debug('PricingPlan for resourceType %s and' +
        'planName %s not found',
      req.params.resource_type, req.params.plan_name);
      return {
        status: 404
      };
    }
    return {
      status: 200,
      body: { plan_id: pricingPlanId }
    };
  });

/**
 * Map Abacus' resource provider and plan to Cloud Foundry's service and plan
 *
 * Parameters:
 *  :resource - resource provider ID
 *  :plan - plan name
 *
 * Body:
 *  {
 *    "organization_guid": "<org_guid>",
 *    "space_guid": "<space_guid>",
 *    "serviceName": "<serviceName>",
 *    "servicePlanName": "<servicePlanName>"
 *  }
 *
 * Response:
 *  - 201 if the mapping is possible. For example if CF org & space is
 *    known to host the service & plan
 *  - client error response code (4xx) if the mapping cannot be created
 *
 * This API shall not return 409 as this prevents the broker from updating a
 * service instance with a new plan.
 */

routes.post(
  '/v1/provisioning/mappings/services/resource' +
  '/:resource/plan/:plan',
  (req, res) => {
    debug('Dummy mapping API post mapping called');
    res.status(201).send();
  });

routes.put(
  '/v1/provisioning/mappings/services/resource' +
  '/:resource/plan/:plan',
  (req, res) => {
    debug('Dummy mapping API post mapping called');
    res.status(201).send();
  });

/**
 * Lists resource provider mappings
 *
 * Note: Not used by Abacus or Abacus Broker
 */
routes.get('/v1/provisioning/mappings/services', (req, res) => {
  debug('Dummy mapping API get mappings called');
  res.status(200).send({});
});

/**
 * Delete resource provider mapping
 *
 * Parameters:
 *  :resource - resource provider ID
 *  :plan - plan name
 */
routes.delete('/v1/provisioning/mappings/services/resource/:resource/' +
  'plan/:plan', (req, res) => {
  debug('Dummy mapping API delete mapping called');
  res.status(200).send();
});

// Create a provisioning service app
const provisioning = () => {
  const app = webapp();

  // Secure provisioning and batch routes using an OAuth
  // bearer access token
  if(secured())
    app.use(/^\/v1\/(provisioning|metering|rating|pricing)|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));

  return app;
};

// Command line interface, create the app and listen
const runCLI = () => provisioning().listen();

// Export our public functions
module.exports = provisioning;
module.exports.storeAllDefaultPlans = storeAllDefaultPlans;

if (!process.env.NON_INTERACTIVE)
  runCLI();
