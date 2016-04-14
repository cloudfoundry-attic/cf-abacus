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
const lru = require('abacus-lrucache');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');
const rconfig = require('abacus-rating-config');
const pconfig = require('abacus-pricing-config');
const mconfig = require('abacus-metering-config');
const dataflow = require('abacus-dataflow');
const oauth = require('abacus-oauth');
const seqid = require('abacus-seqid');

const map = _.map;
const extend = _.extend;
const pick = _.pick;
const filter = _.filter;

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
  provisioning: 9880,
  auth_server: 9882,
  meter: 9100,
  account: 9881
});

// Return OAuth resource or system scopes needed to write input docs
const iwscope = (udoc) => secured() ? {
  resource: [['abacus.usage', udoc.resource_id, 'write'].join('.')],
  system: ['abacus.usage.write']
} : undefined;

// Return OAuth resource or system scopes needed to read input docs
const irscope = (udoc) => secured() ? {
  resource: [['abacus.usage', udoc.resource_id, 'read'].join('.')],
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

const okeys = (udoc, ikey) =>
  [[udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/')];

const otimes = (udoc, itime) =>
  [map([udoc.end, udoc.start], seqid.pad16).concat([itime]).join('/')];

// Business response object
const businessError = (reason) => ({
  error: true,
  reason: reason
});

// Retrieve resource type given the resource id, and attach it to u
const getResourceType = function *(rid, auth) {
  debug('Retrieving resource type for resource id %s', rid);

  const o = auth ? { headers: { authorization: auth } } : {};
  // Get resource type
  const res = yield brequest.get(uris.provisioning +
    '/v1/provisioning/resources/:resource_id/type',
    extend({}, o, {
      cache: true,
      resource_id: rid
    }));

  // Unable to retrieve resource type
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve resource type, %o', res);
    debug('Unable to retrieve resource type, %o', res);

    // Return with the reason of the error
    return businessError('Collector - Unable to retrieve resource type');
  }

  // Return the resource_type
  return {
    resource_type: res.body
  };
};

// Maintain a cache of accounts
const accounts = lru({
  max: 10000,
  maxAge: 1000 * 60 * 20
});

const cachedAccount = (k) => accounts.get(k);

const cacheAccount = (k, account) => {
  accounts.set(k, account);
  return account;
}

// Return the account_id and pricing_country
const getAccount = function *(oid, time, auth) {
  debug('Retrieving account information for org %s', oid);

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [oid, t].join('/');

  // Look in our cache first
  const ac = cachedAccount(k);
  if (ac) {
    debug('Accont information found in the cache');
    return {
      account: ac
    };
  }

  const o = auth ? { headers: { authorization: auth } } : {};

  // Get account information
  const res = yield brequest.get(uris.account +
    '/v1/organizations/:org_id/account/:time',
    extend({}, o, {
      org_id: oid,
      time: time
    }));

  // Unable to retrieve account information
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Return with the reason of the error
    return businessError('Collector - Unable to retrieve account info');
  }

  // cache and returns Return the account_id and the pricing_country
  return {
    account: cacheAccount(k, pick(res.body, 'account_id', 'pricing_country'))
  };
};

// Return the metering_plan_id
const meteringId = yieldable(mconfig.id);

// Return the rating_plan_id
const ratingId = yieldable(rconfig.id);

// Return the prices and the pricing_plan_id
const pricingId = yieldable(pconfig.id);

// Return the pricing plan
const pricingPlan = yieldable(pconfig);

// Extend the submitted usage with the additional information we've
// collected or flag usage doc with error and reasons to redirect 
// usage to error db and stop processing it to the next pipeline.
const normalizeDoc = (u, info) => {
  let e;

  // Go through each information and create list of error reasons
  const reasons = map(info, (i) => {
    e = e || i.error;
    return i.reason;
  });

  // Attachees error flag and list of reasons
  return extend({}, u, e ? {
    error: true,
    reason: filter(reasons, (reason) => {
      return reason;
    })
  } : {
    resource_type: info[0].resource_type,
    account_id: info[1].account.account_id,
    pricing_country: info[1].account.pricing_country,
    metering_plan_id: info[2].metering_plan_id,
    rating_plan_id: info[3].rating_plan_id,
    pricing_plan_id: info[4].pricing_plan_id,
    prices: info[5].pricing_plan
  });
};

// Map submitted usage doc to normalized usage doc
const normalizeUsage = function *(udoc, auth) {
  debug('Normalizing usage %o', udoc);

  // Forward authorization header field to provisioning
  const o = auth ? { headers: { authorization: auth } } : {};

  // Validate the given org/space/consumer/resource/resource_instance
  const res = yield brequest.get(uris.provisioning +
    '/v1/provisioning/organizations/:organization_id/spaces/' +
    ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
    ':plan_id/instances/:resource_instance_id/:time',
    extend({}, o, udoc, {
      consumer_id: udoc.consumer_id || 'UNKNOWN',
      time: udoc.end
    }));

  // Validation failed. Unable to retrieve provisioning information
  // for the given resource instance
  if (res.statusCode !== 200) {
    edebug('Usage validation failed, %o', res);
    debug('Usage validation failed, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

    // Retrieve resource type given the resource id
  const [rt, account] = yield [
    getResourceType(udoc.resource_id, auth),
    getAccount(udoc.organization_id, udoc.end, auth)
  ];

  // Get account information and plan ids
  const [mpid, rpid, ppid] = yield [
    meteringId(udoc.organization_id, rt.resource_type, udoc.plan_id,
      udoc.end, auth),
    ratingId(udoc.organization_id, rt.resource_type, udoc.plan_id,
      udoc.end, auth),
    pricingId(udoc.organization_id, rt.resource_type, udoc.plan_id,
      udoc.end, auth)
  ];

  // Get the usage prices in the account's pricing country
  const prices = yield pricingPlan(ppid.pricing_plan_id,
    !account.error && account.account.pricing_country, auth);

  // Extend the submitted usage with the additional information we've
  // collected
  const nudoc = normalizeDoc(udoc, [rt, account, mpid, rpid, ppid, prices]);

  // Return the normalized usage doc
  return [nudoc];
};

// Create a collector service app
const collector = () => {
  // Create the Webapp
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
      time: itime,
      dedupe: false
    },
    output: {
      type: 'normalized_usage',
      get: '/v1/metering/normalized/usage' + 
        '/k/:korganization_id/:kresource_instance_id' +
        '/:kconsumer_id/:kplan_id' +
        '/t/:tend/:tstart/:tseq',
      dbname: 'abacus-collector-normalized-usage',
      rscope: orscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.meter,
      apps: process.env.METER_APPS,
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
module.exports.account = getAccount;
module.exports.resourceType = getResourceType;
module.exports.runCLI = runCLI;
