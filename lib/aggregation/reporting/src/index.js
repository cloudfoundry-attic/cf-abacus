'use strict';

const { extend, each, filter, first, map, omit, reduce } = require('underscore');

const { mapLimit } = require('async');

const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const dataflow = require('abacus-dataflow');
const retry = require('abacus-retry');
const request = require('abacus-request');
const router = require('abacus-router');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const schema = require('abacus-schema');
const seqid = require('abacus-seqid');
const throttle = require('abacus-throttle');
const timewindow = require('abacus-timewindow');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');
const yieldable = require('abacus-yieldable');
const webapp = require('abacus-webapp');

const createSummarizer = require('./lib/summarizer.js');

const brequest = yieldable(retry(breaker(batch(request))));

const graphql = schema.graphql.graphql;
const GraphQLSchema = schema.graphql.GraphQLSchema;
const GraphQLObjectType = schema.graphql.GraphQLObjectType;
const GraphQLNonNull = schema.graphql.GraphQLNonNull;
const GraphQLString = schema.graphql.GraphQLString;
const GraphQLFloat = schema.graphql.GraphQLFloat;
const GraphQLList = schema.graphql.GraphQLList;

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');
const edebug = require('abacus-debug')('e-abacus-usage-reporting');
const pdebug = require('abacus-debug')('p-abacus-usage-reporting');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// OAuth bearer access token with Abacus system access scopes
let systemToken;


// Resolve service URIs
const uris = urienv({
  account: 9881,
  auth_server: 9882,
  db_accumulator_uri: 'mongodb://localhost:27017',
  db_aggregator_uri: 'mongodb://localhost:27017'
});

// Configure rated usage db
const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage', undefined, uris.db_aggregator_uri);
// Configure accumulated usage db
const accumulatordb = dataflow.db('abacus-accumulator-accumulated-usage', undefined, uris.db_accumulator_uri);


// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () =>
  /^[0-9]+[MDhms]$/.test(process.env.SLACK)
    ? {
      scale: process.env.SLACK.charAt(process.env.SLACK.length - 1),
      width: process.env.SLACK.match(/[0-9]+/)[0]
    }
    : {
      scale: 'm',
      width: 10
    };

// Calculates the max number of time windows in a given time scale based on
// the slack's configuration
const maxSlack = (w) => {
  const slackscale = {
    M: { 4: 1 },
    D: { 4: 28, 3: 1 },
    h: { 4: 672, 3: 24, 2: 1 },
    m: { 4: 40320, 3: 1440, 2: 60, 1: 1 },
    s: { 4: 2419200, 3: 86400, 2: 3600, 1: 60, 0: 1 }
  };
  if (slack().scale && slackscale[slack().scale][w])
    return map(new Array(Math.ceil(1 / slackscale[slack().scale][w] * slack().width) + 1), () => null);
  return [null];
};

// The window length based on the configured slack.
const findWindowLength = () => map([maxSlack(0), maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)], (w) => w.length);

// Adjust the windows to the desired t
const adjustWindows = (windows, ct, t, wl) => map(timewindow.adjustWindows(windows, ct, t), (w, i) => first(w, wl[i]));


const setImmediateEx = yieldable((cb) => {
  setImmediate(cb);
});

const isConsumerProcessedThisMonth = (consumerKey, startOfMonthKey) => {
  return seqid.pad16(dbclient.t(startOfMonthKey)) < seqid.pad16(dbclient.t(consumerKey));
};

// Purge previous quantities
const purgeOldQuantities = (doc) => {
  const deletePreviousQuantity = (entity) => {
    if (entity.aggregated_usage)
      each(entity.aggregated_usage, (aggregatedUsage) =>
        each(aggregatedUsage.windows, (timeWindow) =>
          each(timeWindow, (quantity) => {
            if (quantity) delete quantity.previous_quantity;
          })
        )
      );
  };

  const purgeInResource = (resource) => {
    deletePreviousQuantity(resource);
    each(resource.plans, (plan) => deletePreviousQuantity(plan));
  };

  each(doc.resources, (resource) => purgeInResource(resource));
  if (doc.spaces) each(doc.spaces, (space) => each(space.resources, (resource) => purgeInResource(resource)));
};

const updateConsumers = function*(usage, time, consumers, spaceId, consumersDocMap) {
  const updatedConsumers = [];

  for (let c of consumers) {
    debug('Processing consumer %s', c.id);

    // release the event loop for orgs with many consumers
    yield setImmediateEx();

    // Retrieve the consumer doc with the matching doc_id
    const consumer = consumersDocMap.get([usage.organization_id, spaceId, c.id].join('/'));
    // skip consumer with missing doc
    if (!consumer) continue;
    purgeOldQuantities(consumer);

    pdebug('Org %s, space %s, consumer %s has %d resources',
      usage.organization_id, spaceId, c.id, consumer.resources.length);

    // Shift all the windows
    each(consumer.resources, (resource) => {
      each(resource.plans, (plan) => {
        pdebug('Org %s, space %s, consumer %s, resource %s has %d plans',
          usage.organization_id, spaceId, c.id, resource.resource_id, resource.plans.length);
        each(plan.aggregated_usage, (au) => {
          each(au.windows, (w, i) => {
            timewindow.shiftWindow(consumer.processed, time, w, timewindow.dimensions[i]);
          });
        });
      });
    });

    updatedConsumers.push(
      omit(consumer, [
        '_id',
        'id',
        '_rev',
        'accumulated_usage_id',
        'processed',
        'processed_id',
        'resource_instance_id',
        'start',
        'end',
        'organization_id',
        'resource_id',
        'plan_id',
        'pricing_country',
        'prices'
      ])
    );
  }

  return updatedConsumers;
};

const skipMissingConsumer = (consumerDoc, consumerKey, startOfMonthKey) => {
  if (!consumerDoc || !consumerDoc.doc) {
    const errorMsg = `Failed to find consumer with id ${consumerKey}`;
    edebug(errorMsg);

    return {
      skip: true,
      missingForCurrentMonth: isConsumerProcessedThisMonth(consumerKey, startOfMonthKey)
    };
  }
  return {
    skip: false,
    missingForCurrentMonth: false
  };
};

const filterConsumerResources = (consumerDoc, consumerKey, resourceId) => {
  debug('Filtering consumer %s resources by resource id: %s', consumerKey, resourceId);

  consumerDoc.resources = filter(consumerDoc.resources, (res) => res.resource_id === resourceId);
};

const buildConsumersMap = (consumers, ids, startOfMonthKey, resourceId) => {
  const consumersDocMap = new Map();
  let hasMissingConsumer = false;

  for (let i = 0; i < consumers.length; i++) {
    const consumer = skipMissingConsumer(consumers[i], ids[i], startOfMonthKey);
    if (consumer.skip) {
      if (consumer.missingForCurrentMonth)
        hasMissingConsumer = true;
      continue;
    }

    const consumerKey = dbclient.k(consumers[i].doc._id);
    if (resourceId) filterConsumerResources(consumers[i].doc, consumerKey, resourceId);
    consumersDocMap.set(consumerKey, consumers[i].doc);
  }

  return {
    map: consumersDocMap,
    hasMissingConsumer: hasMissingConsumer
  };
};

// Returns a copy of the passed in org usage with the spaces populated
const spaceUsage = function*(usage) {
  const ids = [], orgSpaces = [];
  let hasMissingSpace = false;
  each(usage.spaces, (space) => {
    if (space.resources)
      orgSpaces.push(space);
    else
      ids.push(['k', usage.organization_id, space.space_id, 't', space.t].join('/'));
  });

  debug('Retrieving space usage for organization %o and spaces %o', usage.organization_id, ids);
  const spaces = (yield aggregatordb.allDocs({
    keys: ids,
    include_docs: true
  })).rows;

  let spaceDocs = reduce(spaces, function(memo, space, key) {
    if (space && space.doc) {
      memo.push({
        space_id: space.doc.space_id,
        resources: space.doc.resources,
        consumers: space.doc.consumers
      });
      return memo;
    }
    hasMissingSpace = true;
    edebug('Cannot retrieve space usage for organization %o and aggregatordb id %o', usage.organization_id, ids[key]);
    return memo;
  }, []);

  if (orgSpaces.length)
    spaceDocs = spaceDocs.concat(orgSpaces);

  pdebug('Org %s has %d spaces', usage.organization_id, orgSpaces.length);
  debug('Space docs: %o', spaceDocs);

  usage.spaces = spaceDocs;
  usage.hasMissingSpaces = hasMissingSpace;
};

// Returns a copy of the passed in org usage with the consumers populated
const consumerUsage = function*(usage, time, resourceId, startOfMonthKey) {
  // Collect the list of consumer ids to query for
  const ids = [];
  each(usage.spaces, (space) => {
    each(space.consumers, (consumer) => {
      ids.push(['k', usage.organization_id, space.space_id, consumer.id, 't', consumer.t].join('/'));
    });
  });

  debug('Retrieving consumer usage for organization %o and consumers %o', usage.organization_id, ids);
  const consumers = (yield aggregatordb.allDocs({
    keys: ids,
    include_docs: true
  })).rows;

  const consumersDocs = buildConsumersMap(consumers, ids, startOfMonthKey, resourceId);
  const consumersDocMap = consumersDocs.map;

  // Return a copy of the usage data with consumer objects populated
  const doc = extend({}, usage, { hasMissingConsumers: consumersDocs.hasMissingConsumer });
  let numConsumers = 0;
  for (let space of doc.spaces) {
    space.consumers = yield updateConsumers(usage, time, space.consumers, space.space_id, consumersDocMap);
    debug('Consumer docs for org %s and resource id %s: %o', usage.organization_id, resourceId, space.consumers);
    numConsumers += space.consumers.length;
  }

  pdebug('Org %s has %d consumers (resource %s)', usage.organization_id, numConsumers, resourceId);

  return doc;
};

const getConsumerUsage = function*(orgId, time, auth, resourceId) {
  // Forward authorization header field to account to authorize
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time',
    extend(o, {
      org_id: orgId,
      time: time
    })
  );

  // Authorization failed. Unable to retrieve account information
  // for the given organization
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  // Compute the query range
  const d = moment.utc(time);
  const mt = moment.utc([d.year(), d.month(), 1]).valueOf();
  const startId = dbclient.kturi(orgId, seqid.pad16(time)) + 'ZZZ';
  const endId = dbclient.kturi(orgId, seqid.pad16(mt));

  debug('Retrieving latest rated usage between %s and %s', endId, startId);
  const doc = yield aggregatordb.allDocs({
    endkey: endId,
    startkey: startId,
    descending: true,
    limit: 1,
    include_docs: true
  });

  if (!doc.rows.length) {
    debug('No existing rated usage');
    return {
      id: dbclient.kturi(orgId, time),
      organization_id: orgId,
      start: mt,
      end: time,
      resources: [],
      spaces: []
    };
  }

  const usageDoc = doc.rows[0].doc;
  debug('Found rated usage %o', usageDoc);

  yield spaceUsage(usageDoc);

  timewindow.shift(usageDoc, { processed: usageDoc.processed }, time);
  purgeOldQuantities(usageDoc);

  if (resourceId) {
    debug('Filtering usage document for resource: %s', resourceId);
    usageDoc.resources = filter(usageDoc.resources, (res) => res.resource_id === resourceId);
    for (let space of usageDoc.spaces)
      space.resources = filter(space.resources, (res) => res.resource_id === resourceId);
  }

  return yield consumerUsage(usageDoc, time, resourceId, endId);
};

// Return the usage for an org in a given time period
const orgUsage = (orgId, time = moment.now(), auth, resourceId, cb) => {

  const startTime = moment.now();
  const consumerUsageCb = yieldable.functioncb(getConsumerUsage);
  consumerUsageCb(orgId, time, auth, resourceId, (err, consumerUsage) => {
    if (err) {
      edebug('Could not generate consumer usage for org %s due to: %o', orgId, err);
      cb(err);
      return;
    }

    const tokenAuth = systemToken && systemToken();
    const summarizer = createSummarizer(time, consumerUsage, tokenAuth);
    summarizer.summarizeUsage((err, summarizedUsage) => {
      if (err) {
        edebug('Could not summarize usage for org %s due to: %o', orgId, err);
        cb(err);
        return;
      }

      pdebug('Generated usage for org %s and resource id %s for %d ms', orgId, resourceId, moment.now() - startTime);
      cb(undefined, summarizedUsage);
    });
  });
};

// Return the usage for a list of orgs in a given time period
const orgsUsageCb = (orgIds, time, auth, cb) => {
  mapLimit(orgIds, 10, (orgId, cb) => orgUsage(orgId, time, auth, undefined, cb), (err, result) => cb(err, result));
};

const orgsUsage = yieldable(orgsUsageCb);

// Return the usage for a resource instance for a particular plan in a given
// organization, consumer, time period
const resourceInstanceUsage = function*(
  orgid,
  spaceid,
  resourceInstanceId,
  consumerId,
  planid,
  meteringPlanId,
  ratingPlanId,
  pricingPlanId,
  timeBasedKeySegment,
  time,
  auth
) {
  // Forward authorization header field to account to authorize
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time',
    extend(o, {
      org_id: orgid,
      time: time
    })
  );

  // Authorization failed. Unable to retrieve account information
  // for the given organization
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  const id = [
    'k',
    orgid,
    resourceInstanceId,
    consumerId,
    planid,
    meteringPlanId,
    ratingPlanId,
    pricingPlanId,
    't',
    timeBasedKeySegment
  ].join('/');

  const doc = yield accumulatordb.get(id);

  if (!doc) {
    debug('No resource instance usage found for %s on %s', resourceInstanceId, time);

    // Return an empty usage report if no usage was found
    return {};
  }

  // Adjust the windows to the requested time
  each(doc.accumulated_usage, (au) => {
    au.windows = adjustWindows(au.windows, doc.processed, time, findWindowLength());
  });

  debug('Found accumulated usage %o', doc);

  const summarizer = createSummarizer(doc.processed, doc, auth);
  return yield summarizer.summarizeInstanceUsage();
};

// Return the usage for an account in a given time period
const accountUsage = function*(accountid, time, auth) {
  const t = time || moment.now();

  // Forward authorization header field to account
  const o = auth ? { headers: { authorization: auth } } : {};

  const account = yield brequest.get(
    uris.account + '/v1/accounts/:account_id',
    extend(o, {
      account_id: accountid
    })
  );

  // Validation failed. Unable to retrieve account information for the given account id
  if (account.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', account);
    debug('Unable to retrieve account information, %o', account);

    // Throw response object as an exception to stop further processing
    throw account;
  }

  if (!account.body || !account.body.organizations) return undefined;
  return yield orgsUsage(account.body.organizations, t, auth);
};

// Define GraphQL query schema
const organizationType = schemas.organizationReport.graph();
const instanceType = schemas.resourceInstanceReport.graph();

const graphSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'query',
    fields: () => ({
      organization: {
        type: organizationType,
        args: {
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgUsage)(args.organization_id, args.time, args.authorization, undefined);
        }
      },
      organizations: {
        type: new GraphQLList(organizationType),
        args: {
          organization_ids: {
            name: 'organization_ids',
            type: new GraphQLList(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgsUsage)(args.organization_ids, args.time, args.authorization);
        }
      },
      account: {
        type: new GraphQLList(organizationType),
        args: {
          account_id: {
            name: 'account_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(accountUsage)(args.account_id, args.time, args.authorization);
        }
      },
      resource_instance: {
        type: instanceType,
        args: {
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          space_id: {
            name: 'space_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          consumer_id: {
            name: 'consumer_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          resource_instance_id: {
            name: 'resource_instance_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          plan_id: {
            name: 'plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          metering_plan_id: {
            name: 'metering_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          rating_plan_id: {
            name: 'rating_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          pricing_plan_id: {
            name: 'pricing_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          t: {
            name: 't',
            type: GraphQLString
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(resourceInstanceUsage)(
            args.organization_id,
            args.space_id,
            args.resource_instance_id,
            args.consumer_id,
            args.plan_id,
            args.metering_plan_id,
            args.rating_plan_id,
            args.pricing_plan_id,
            args.t,
            args.time,
            args.authorization
          );
        }
      }
    })
  })
});

// Run a GraphQL query as a generator
const runQuery = function*(query) {
  // Convert the promise returned by graphql to a generator then yield it
  return yield yieldable(graphql(graphSchema, query));
};

// Return OAuth system scopes needed to retrieve org usage
const sysScopes = () =>
  secured()
    ? { system: ['abacus.usage.read'] }
    : undefined;

// Return OAuth resource or system scopes needed to retrieve resource instance
// usage
const scopes = (resourceId) =>
  secured()
    ? {
      resource: [['abacus.usage', resourceId, 'read'].join('.')],
      system: ['abacus.usage.read']
    }
    : undefined;

// Retrieve a usage report summary for a given org and time in msec
/* eslint complexity: [1, 8] */
const retrieveUsage = (req, res, cb) => {
  debug('Retrieving rated usage for organization %s on %s', req.params.organization_id, req.params.time);

  let resourceId;

  if (secured())
    try {
      const parsedScopes = oauth.parseTokenScope(req.headers && req.headers.authorization);
      debug('Parsed token scopes %o', parsedScopes);
      if (parsedScopes.readResourceScopes.length > 0) {
        resourceId = parsedScopes.readResourceScopes[0];
        debug('Using resource ID %s', resourceId);
      } else if (!parsedScopes.hasSystemReadScope) {
        const msg = 'Invalid token: insufficient scope';
        debug(msg);
        cb(undefined, {
          statusCode: 403,
          body: msg
        });
        return;
      }
    } catch (e) {
      debug('Access validation failed with %o', e);
      cb(undefined, {
        statusCode: 403,
        body: e.error
      });
      return;
    }

  // Retrieve and return the rated usage for the given org and time
  orgUsage(
    req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization,
    resourceId,
    (err, usage) => {
      if (err) {
        cb(undefined, {
          statusCode: err.statusCode || 500,
          body: err
        });
        return;
      }

      const report = omit(dbclient.undbify(usage), [
        'last_rated_usage_id',
        'aggregated_usage_id',
        'accumulated_usage_id',
        'resource_instance_id',
        'consumer_id',
        'resource_id',
        'plan_id',
        'pricing_country',
        'prices',
        'hasMissingConsumers',
        'hasMissingSpaces'
      ]);

      if (usage && (usage.hasMissingConsumers || usage.hasMissingSpaces))
        cb(undefined, {
          statusCode: 206,
          body: report
        });
      else
        cb(undefined, {
          body: report
        });
    }
  );

};

// Retrieve a usage report summary for a resource instance given the
//   org, space, resource instance, consumer, plan, metering plan, rating plan, pricing plan, t, time
const retrieveResourceInstanceUsage = function*(req) {
  debug('Retrieving rated usage for resource instance %s on %s', req.params.resource_instance_id, req.params.time);

  if (secured()) oauth.authorize(req.headers && req.headers.authorization, scopes(req.params.resource_id));

  const doc = yield resourceInstanceUsage(
    req.params.organization_id,
    req.params.space_id,
    req.params.resource_instance_id,
    req.params.consumer_id,
    req.params.plan_id,
    req.params.metering_plan_id,
    req.params.rating_plan_id,
    req.params.pricing_plan_id,
    req.params.t,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization
  );

  return {
    body: omit(dbclient.undbify(doc), ['last_rated_usage_id', 'aggregated_usage_id', 'accumulated_usage_id'])
  };
};

const routes = router();

const throttledRetrieveUsage = throttle(retrieveUsage);
routes.get('/v1/metering/organizations/:organization_id/aggregated/usage/:time', throttledRetrieveUsage);
routes.get('/v1/metering/organizations/:organization_id/aggregated/usage', throttledRetrieveUsage);

routes.get(
  '/v1/metering/organizations/:organization_id/spaces/:space_id/' +
    'resource_id/:resource_id/resource_instances/:resource_instance_id/' +
    'consumers/:consumer_id/plans/:plan_id/metering_plans/:metering_plan_id/' +
    'rating_plans/:rating_plan_id/pricing_plans/:pricing_plan_id/' +
    't/:t/aggregated/usage/:time',
  throttle(retrieveResourceInstanceUsage)
);

// Retrieve a usage summary using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query',
  throttle(function*(req) {
    debug('Retrieving rated usage using graphql query %s', req.params.query);

    if (secured()) oauth.authorize(req.headers && req.headers.authorization, sysScopes());

    const q =
      req.headers && req.headers.authorization
        ? req.params.query.replace(/(.*)\((.*)/, '$1(authorization: "' + req.headers.authorization + '", $2')
        : req.params.query;
    debug('Modified graphql query %s', q);

    // Run the given GraphQL query and return the result
    const doc = yield runQuery(q);
    debug('Graphql query result %o', doc);
    if (doc.errors) {
      edebug('Graphql query error %o', doc.errors);
      debug('Graphql query error %o', doc.errors);
      throw extend(new Error('Graphql query error - ' + doc.errors[0].message), {
        statusCode: 400,
        error: 'query',
        reason: doc.errors[0].message,
        noretry: true,
        nobreaker: true
      });
    }

    return {
      body: omit(dbclient.undbify(doc.data), [
        'last_rated_usage_id',
        'aggregated_usage_id',
        'accumulated_usage_id',
        'resource_instances',
        'resource_id',
        'plan_id',
        'pricing_country',
        'prices'
      ])
    };
  })
);

// Create a reporting service app
const reporting = () => {
  const app = webapp();

  // Secure organizations, metering and batch routes
  // using an OAuth bearer access token
  if (secured()) app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(
      uris.auth_server,
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      'abacus.usage.write abacus.usage.read'
    );

    systemToken.start();
  }

  reporting().listen();
};

// Export our public functions
module.exports = reporting;

runCLI();
