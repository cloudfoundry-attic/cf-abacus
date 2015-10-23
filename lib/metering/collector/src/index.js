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
const transform = require('abacus-transform');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');
const dataflow = require('abacus-dataflow');
const oauth = require('abacus-cfoauth');
const seqid = require('abacus-seqid');

const map = _.map;
const extend = _.extend;
const uniq = _.uniq;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  provisioning: 9380,
  auth_server: 9382,
  meter: 9081
});

// Return OAuth resource or system scopes needed to write input docs
const iwscope = (udoc) => secured() ? {
  resource: map(uniq(map(udoc.usage, (u) => u.resource_id)),
    (rid) => ['abacus.usage', rid, 'write'].join('.')),
  system: ['abacus.usage.write']
} : undefined;

// Return OAuth resource or system scopes needed to read input docs
const irscope = (udoc) => secured() ? {
  resource: map(uniq(map(udoc.usage, (u) => u.resource_id)),
    (rid) => ['abacus.usage', rid, 'read'].join('.')),
  system: ['abacus.usage.read']
} : undefined;

// Return OAuth resource or system scopes needed to read output docs
const orscope = (udoc) => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return the keys and times of our docs
const ikey = (udoc, auth) => {
  let userInfo;
  if (secured() && auth)
    // Get user information from authorization token
    userInfo = oauth.getUserInfo(auth.replace(/^bearer /i, ''));

  // Use client id or anonymous
  return userInfo && userInfo.client_id || 'anonymous';
};

const itime = (udoc) =>
  seqid();

const okeys = (udoc) =>
  map(udoc.usage, (u) =>
    [u.organization_id, u.resource_instance_id, u.plan_id].join('/'));

const otimes = (udoc) =>
  map(udoc.usage, (u) => map([u.start, u.end], seqid.pad16).join('/'));

// Map submitted resource usage doc to normalized usage docs
const normalizeUsage = function *(udoc, auth) {
  debug('Normalizing usage %o', udoc);

  // Forward authorization header field to provisioning
  const o = auth ? { headers: { authorization: auth } } : {};

  // Validate the given region/org/space/consumer/resource/resource_instances
  yield tmap(udoc.usage, function *(u) {
    const res = yield brequest.get(uris.provisioning +
      '/v1/provisioning/regions/:region/orgs/:organization_id/spaces/' +
      ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
      ':plan_id/instances/:resource_instance_id/:time',
      extend(o, u, {
        cache: true,
        consumer_id: u.consumer_id || 'UNKNOWN',
        time: u.end
      }));

    // Validation failed. Unable to retrieve provisioning information
    // for the given resource instance
    if (res.statusCode !== 200) {
      edebug('Unable to retrieve provisioning information, %o', res);
      debug('Unable to retrieve provisioning information, %o', res);

      // Throw response object as an exception to stop further processing
      throw res;
    }
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
      get: '/v1/metering/collected/usage/t/:tseq/k/:kprovider',
      dbname: 'abacus-collector-collected-usage',
      wscope: iwscope,
      rscope: irscope,
      key: ikey,
      time: itime
    },
    output: {
      type: 'normalized_usage',
      get: '/v1/metering/normalized/usage' + 
        '/k/:korganization_id/:kresource_instance_id/:kplan_id' +
        '/t/:tend/:tstart',
      dbname: 'abacus-collector-normalized-usage',
      rscope: orscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.meter,
      post: '/v1/metering/normalized/usage',
      authentication: systemToken
    }
  });

  app.use(mapper);
  app.use(router.batch(app));

  app.mapper = mapper;
  return app;
};

// Command line interface, create the collector app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  // Create the app, replay any failed events, and listen
  const app = collector();
  dataflow.replay(app.mapper, 0, () => {
    app.listen();
  });
};

// Export our public functions
module.exports = collector;
module.exports.runCLI = runCLI;
