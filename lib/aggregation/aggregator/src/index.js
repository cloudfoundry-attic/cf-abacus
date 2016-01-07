'use strict';

// Usage aggregator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const batch = require('abacus-batch');
const request = require('abacus-request');
const yieldable = require('abacus-yieldable');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const oauth = require('abacus-oauth');
const configcb = require('abacus-resource-config');
const meterConfigcb = require('abacus-metering-config');
const rateConfigcb = require('abacus-rating-config');
const pricescb = require('abacus-price-config');
const transform = require('abacus-transform');
const dataflow = require('abacus-dataflow');
const lru = require('abacus-lrucache');

const filter = _.filter;
const map = _.map;
const last = _.last;
const extend = _.extend;
const rest = _.rest;
const pick = _.pick;

const brequest = yieldable(retry(breaker(batch(request))));

const treduce = yieldable(transform.reduce);

const config = yieldable(configcb);
const prices = yieldable(pricescb);
const meterConfig = yieldable(meterConfigcb);
const rateConfig = yieldable(rateConfigcb);
const pricesV2 = yieldable(pricescb.configV2);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  account: 9881,
  sink: undefined
});

// Return OAuth system scopes needed to write input docs
const iwscope = (udoc) => secured() ? {
  system: ['abacus.usage.write']
} : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = (udoc) => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return the keys and times of our docs
const ikey = (udoc) =>
  udoc.organization_id;

const igroup = (udoc) =>
  udoc.organization_id;

const itime = (udoc) =>
  seqid();

const okeys = (udoc, ikey) =>
  [udoc.organization_id];

const otimes = (udoc, itime) =>
  [itime];

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month, Year, Forever]
const timescale = [1, 100, 10000, 1000000, 100000000];

// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = (t) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
    + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
    + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
};

// Find an element with the specified id in a list, and lazily construct and
// add a new one if no element is found
const lazyCons = (l, prop, id, cons) => {
  const f = filter(l, (e) => e[prop] === id);
  if(f.length) return f[0];
  const e = new cons(id);
  l.push(e);
  return e;
};

// Define the objects used to represent a hiearchy of aggregated usage inside
// an organization

// Represent an org, aggregated resource usage and the spaces it contains
const Org = function(id) {
  extend(this, {
    organization_id: id,
    resources: [],
    spaces: []
  });
};
const newOrg = function(id) {
  return new Org(id);
};
Org.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};
Org.prototype.space = function(id) {
  return lazyCons(this.spaces, 'space_id', id, Org.Space);
};

// Represent a space, aggregated resource usage and the consumers it contains
Org.Space = function(id) {
  extend(this, {
    space_id: id,
    resources: [],
    consumers: []
  });
};
Org.Space.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};
Org.Space.prototype.consumer = function(id) {
  return lazyCons(this.consumers, 'consumer_id', id, Org.Consumer);
};

// Represent a consumer and aggregated resource usage
Org.Consumer = function(id) {
  extend(this, {
    consumer_id: id,
    resources: []
  });
};
Org.Consumer.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};

// Represent a resource and its aggregated metric usage
Org.Resource = function(id) {
  extend(this, {
    resource_id: id,
    plans: [],
    aggregated_usage: []
  });
};
Org.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, 'plan_id', id, Org.Plan);
};
Org.Resource.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a plan and its aggregated metric usage
Org.Plan = function(id) {
  extend(this, {
    plan_id: id,
    aggregated_usage: []
  });
};
Org.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a metric based aggregation windows
Org.Metric = function(metric) {
  extend(this, {
    metric: metric,
    windows: [
      [null],
      [null],
      [null],
      [null],
      [null]
    ]
  });
};

// Revive an org object
const reviveOrg = (org) => {
  org.resource = Org.prototype.resource;
  org.space = Org.prototype.space;
  map(org.resources, (s) => {
    s.plan = Org.Resource.prototype.plan;
    s.metric = Org.Resource.prototype.metric;
    map(s.plans, (s) => {
      s.metric = Org.Plan.prototype.metric;
    });
  });
  map(org.spaces, (s) => {
    s.resource = Org.Space.prototype.resource;
    s.consumer = Org.Space.prototype.consumer;
    map(s.resources, (r) => {
      r.plan = Org.Resource.prototype.plan;
      r.metric = Org.Resource.prototype.metric;
      map(r.plans, (p) => {
        p.metric = Org.Plan.prototype.metric;
      });
    });
    map(s.consumers, (c) => {
      c.resource = Org.Consumer.prototype.resource;
      map(c.resources, (r) => {
        r.plan = Org.Resource.prototype.plan;
        r.metric = Org.Resource.prototype.metric;
        map(r.plans, (p) => {
          p.metric = Org.Plan.prototype.metric;
        });
      });
    });
  });
  return org;
};

// Maintain a cache of accounts
const accounts = lru({
  max: 10000,
  maxAge: 1000 * 3600 * 6
});

// Return the account details configured for an organization's
// using batch and group by organization
const orgAccount = function *(oid) {
  // Get account details for a given organization
  debug('Retrieving account details for org %s', oid);

  // Look in our cache first
  const ac = accounts.get(oid);
  if(ac) return ac;

  // Forward authorization header field to account
  const o = systemToken ?
    { headers: { authorization: systemToken() } } : {};
  const account = yield brequest.get(
    uris.account + '/v1/orgs/:org_id/account', extend(o, {
      org_id: oid
    }));

  if(!account.body) {
    debug('Unable to find account for org %s', oid);
    edebug('Unable to find account for org %s', oid);
    throw new Error('Unable to find account for org');
  }

  const accountDetails = pick(account.body, 'account_id', 'pricing_country');

  // Cache and return
  accounts.set(oid, accountDetails);
  return accountDetails;
};

// Return the configured price for the given plan, metric, and country
const price = (pconf, pid, metric, country) => {
  if(pconf) {
    // Find the specified plan
    const plan = filter(pconf.plans, (p) => p.plan_id === pid);
    if(plan.length) {
      // Find the specified metric price
      const metrics = filter(plan[0].metrics, (m) => m.name === metric);

      // Use the configured price for the specified country, default to 0
      const cp = filter(metrics[0].prices, (p) => p.country === country);
      return cp.length ? cp[0].price : 0;
    }
  }
  return 0;
};

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Return the aggregate function for a given metric
const aggrfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].aggregatefn;
};

// Shifts w in the timescale of i by the difference in time between n and o
const shift = (o, n, w, i) => {
  if(w.length <= 1)
    return;
  // Zero out any smaller timescales than the current one
  const od = new Date(Date.UTC.apply(null, [
    o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate(), o.getUTCMinutes(),
    o.getUTCSeconds()].slice(0, 6 - i)));
  const nd = Date.UTC.apply(null, [
    n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCMinutes(),
    n.getUTCSeconds()].slice(0, 6 - i));

  // Based upon the time scale, the modification function is chosen
  const increment = {
    0: (d) => d.setUTCSecond(d.getUTCSecond() + 1),
    1: (d) => d.setUTCMinutes(d.getUTCMinutes() + 1),
    2: (d) => d.setUTCHour(d.getUTCHour() + 1),
    3: (d) => d.setUTCDate(d.getUTCDate() + 1),
    4: (d) => d.setUTCMonth(d.getUTCMonth() + 1)
  };

  // Count from od to nd the number of positions that need to be shifted
  let shifts = 0;
  map(Array(w.length), () => {
    if(od.getTime() < nd) {
      shifts++;
      increment[i](od);
    }
  });

  // Shift by the number of positions counted
  map(Array(shifts), () => {
    w.unshift(null);
    w.pop();
  });
};

// Aggregate usage and return new aggregated usage
const aggregate = function *(a, u) {
  debug(
    'Aggregating usage %o from %d and new usage %o from %d',
    a, a ? a.end : 0, u, u.end);

  // Compute the aggregated usage time and new usage time
  const newend = dateUTCNumbify(u.processed);
  const oldend = a ? dateUTCNumbify(a.processed) : 0;
  const docend = dateUTCNumbify(u.end);

  const account = yield orgAccount(u.organization_id);

  // Deep clone and revive the org aggregated usage object behavior
  const newa = a ?
    extend(reviveOrg(JSON.parse(JSON.stringify(a))), {
      account_id: account.account_id,
      end: u.end
    }) :
    extend(newOrg(u.organization_id), {
      start: u.start,
      end: u.end,
      account_id: account.account_id
    });

  // Retrieve the pricing country configured for the org's account
  const country = !account.pricing_country ?
    'USA' : account.pricing_country;
  debug('Pricing country %o', country);

  // Get resource configuration
  const rconf = yield config(u.resource_id, u.end,
    systemToken && systemToken());
  const rplan = filter(rconf.plans, (p) => p.plan_id === u.plan_id)[0];

  const pconf = yield prices(u.resource_id, u.end,
    systemToken && systemToken());

  // Go through the incoming accumulated usage metrics
  map(u.accumulated_usage, (ua) => {
    // Find the aggregate function for the given metric
    const afn = aggrfn(rplan.metrics, ua.metric);

    // Find the rate function for the given metric
    const rfn = ratefn(rplan.metrics, ua.metric);

    // Find the price for the given plan, metric and country
    const rp = price(pconf, u.plan_id, ua.metric, country);

    const aggr = (am, addCost) => {
      // We're mutating the input windows property here
      // but it's really the simplest way to apply the aggregation formula
      am.windows = map(am.windows, (w, i) => {
        // Get the time difference between the new and old processed time
        const timediff = Math.floor(newend / timescale[i]) -
          Math.floor(oldend / timescale[i]);

        // Calculate the slack index in case a slack is set
        const si = Math.max(Math.floor(newend / timescale[i])
          - Math.floor(docend / timescale[i]), 0);

        // If the number of slack windows in the aggregated usage is less than
        // the number in the incoming accumulated usage, push until they equal
        if(w.length < ua.windows[i].length)
          map(Array(ua.windows[i].length - w.length), () =>
            w.push(null));

        // Push older windows down the slack list
        if(a && timediff > 0)
          shift(new Date(a.processed), new Date(u.processed), w, i);

        /* eslint complexity: [1, 6] */
        const quantities = map(w, (q, j) => {
          // Instead of returning undefined or null,
          // returning previously aggregated quantity
          // TODO: Calculation has to use slack window to determine
          // what to do here
          if(!ua.windows[i][j] || si !== j)
            return q;

          if(timediff > 0)
            return {
              quantity: afn(0, ua.windows[i][j].quantity.previous || 0,
                ua.windows[i][j].quantity.current)
            };

          return {
            quantity: afn(q && q.quantity || 0,
              ua.windows[i][j].quantity.previous || 0,
              ua.windows[i][j].quantity.current)
          };
        });

        return addCost ? map(quantities, (q) => q ?
          extend(q, { cost: q.quantity ?
            rfn(rp, q.quantity) : 0 }) : null) : quantities;
      });

    };

    // Apply the aggregate function to the aggregated usage tree
    aggr(
      newa.resource(u.resource_id).metric(ua.metric), false);
    aggr(
      newa.resource(u.resource_id).plan(u.plan_id)
      .metric(ua.metric), true);
    aggr(
      newa.space(u.space_id).resource(u.resource_id)
      .metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).resource(u.resource_id).plan(u.plan_id)
      .metric(ua.metric), true);
    aggr(
      newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN')
        .resource(u.resource_id).metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN')
        .resource(u.resource_id).plan(u.plan_id).
          metric(ua.metric), true);
  });

  // Remove aggregated usage object behavior and return
  const jsa = JSON.parse(JSON.stringify(newa));
  debug('New aggregated usage %o', jsa);
  return jsa;
};

// Aggregate the given accumulated usage
// Process a group of usage docs and compute the corresponding
// aggregated usage
const aggregateUsage = function *(aggr, udocs) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield aggregate(last(log)[0], udoc);
    return log.concat([[res]]);

  }, [[
    aggr
  ]]);
  return rest(ologs);
};

// Represent an org, aggregated resource usage and the spaces it contains
const OrgV2 = function(id) {
  extend(this, {
    organization_id: id,
    resources: [],
    spaces: []
  });
};
const newOrgV2 = function(id) {
  return new OrgV2(id);
};
OrgV2.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, OrgV2.Resource);
};
OrgV2.prototype.space = function(id) {
  return lazyCons(this.spaces, 'space_id', id, OrgV2.Space);
};

// Represent a space, aggregated resource usage and the consumers it contains
OrgV2.Space = function(id) {
  extend(this, {
    space_id: id,
    resources: [],
    consumers: []
  });
};
OrgV2.Space.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, OrgV2.Resource);
};
OrgV2.Space.prototype.consumer = function(id) {
  return lazyCons(this.consumers, 'consumer_id', id, OrgV2.Consumer);
};

// Represent a consumer and aggregated resource usage
OrgV2.Consumer = function(id) {
  extend(this, {
    consumer_id: id,
    resources: []
  });
};
OrgV2.Consumer.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, OrgV2.Resource);
};

// Represent a resource and aggregated resource usage
OrgV2.Resource = function(id) {
  extend(this, {
    resource_id: id,
    metering_plans: [],
    aggregated_usage: []
  });
};
OrgV2.Resource.prototype.metering_plan = function(id) {
  return lazyCons(this.metering_plans, 'metering_plan_id', id,
    OrgV2.Metering_plan);
};
OrgV2.Resource.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, OrgV2.Metric);
};

// Represent a metering plan and its aggregated metric usage
OrgV2.Metering_plan = function(id) {
  extend(this, {
    metering_plan_id: id,
    rating_plans: [],
    aggregated_usage: []
  });
};
OrgV2.Metering_plan.prototype.rating_plan = function(id) {
  return lazyCons(this.rating_plans, 'rating_plan_id', id,
    OrgV2.Rating_plan);
};
OrgV2.Metering_plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, OrgV2.Metric);
};

// Represent a rating plan and its aggregated metric usage
OrgV2.Rating_plan = function(id) {
  extend(this, {
    rating_plan_id: id,
    prices: [],
    aggregated_usage: []
  });
};
OrgV2.Rating_plan.prototype.price = function(id) {
  return lazyCons(this.prices, 'price_id', id, OrgV2.Price);
};
OrgV2.Rating_plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, OrgV2.Metric);
};

// Represent a price and its aggregated metric usage
OrgV2.Price = function(id) {
  extend(this, {
    price_id: id,
    aggregated_usage: []
  });
};
OrgV2.Price.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, OrgV2.Metric);
};

// Represent a metric based aggregation windows
OrgV2.Metric = function(metric) {
  extend(this, {
    metric: metric,
    windows: [
      [null],
      [null],
      [null],
      [null],
      [null]
    ]
  });
};

// Revive an org object
const reviveOrgV2 = (org) => {
  org.resource = OrgV2.prototype.resource;
  org.space = OrgV2.prototype.space;
  map(org.resources, (r) => {
    r.metering_plan = OrgV2.Resource.prototype.metering_plan;
    r.metric = OrgV2.Resource.prototype.metric;
    map(r.metering_plans, (m) => {
      m.rating_plan = OrgV2.Metering_plan.prototype.rating_plan;
      m.metric = OrgV2.Metering_plan.prototype.metric;
      map(m.rating_plans, (r) => {
        r.price = OrgV2.Rating_plan.prototype.price;
        r.metric = OrgV2.Rating_plan.prototype.metric;
        map(r.prices, (p) => {
          p.metric = OrgV2.Price.prototype.metric;
        })
      });
    });
  });
  map(org.spaces, (s) => {
    s.resource = OrgV2.Space.prototype.resource;
    s.consumer = OrgV2.Space.prototype.consumer;
    map(s.resources, (r) => {
      r.metering_plan = OrgV2.Resource.prototype.metering_plan;
      r.metric = OrgV2.Resource.prototype.metric;
      map(r.metering_plans, (p) => {
        p.rating_plan = OrgV2.Metering_plan.prototype.rating_plan;
        p.metric = OrgV2.Metering_plan.prototype.metric;
        map(p.rating_plans, (r) => {
          r.price = OrgV2.Rating_plan.prototype.price;
          r.metric = OrgV2.Rating_plan.prototype.metric;
          map(r.prices, (p) => {
            p.metric = OrgV2.Price.prototype.metric;
          })
        });
      });
    });
    map(s.consumers, (c) => {
      c.resource = OrgV2.Consumer.prototype.resource;
      map(c.resources, (r) => {
        r.metering_plan = OrgV2.Resource.prototype.metering_plan;
        r.metric = OrgV2.Resource.prototype.metric;
        map(r.metering_plans, (p) => {
          p.rating_plan = OrgV2.Metering_plan.prototype.rating_plan;
          p.metric = OrgV2.Metering_plan.prototype.metric;
          map(p.rating_plans, (r) => {
            r.price = OrgV2.Rating_plan.prototype.price;
            r.metric = OrgV2.Rating_plan.prototype.metric;
            map(r.prices, (p) => {
              p.metric = OrgV2.Price.prototype.metric;
            });
          })
        });
      });
    });
  });
  return org;
};

// Return the configured price for the given plan, metric, and country
// mid: metering_plan_id, rid: rating_plan_id, pid: price_id
const priceV2 = (pconf, rid, metric, country) => {
  if(pconf) {
    // Find the specified plan
    const plan = filter(pconf.rating_plans, (p) =>
      p.rating_plan_id === rid);
    if(plan.length) {
      // Find the specified metric price
      const metrics = filter(plan[0].metrics, (m) => m.name === metric);

      // Use the configured price for the specified country, default to 0
      const cp = filter(metrics[0].prices, (p) => p.country === country);
      return cp.length ? cp[0].price : 0;
    }
  }
  return 0;
};

// Aggregate usage and return new aggregated usage
const aggregateV2 = function *(a, u) {
  debug(
    'Aggregating usage %o from %d and new usage %o from %d',
    a, a ? a.end : 0, u, u.end);

  // Compute the aggregated usage time and new usage time
  const newend = dateUTCNumbify(u.processed);
  const oldend = a ? dateUTCNumbify(a.processed) : 0;
  const docend = dateUTCNumbify(u.end);

  const account = yield orgAccount(u.organization_id);

  // Deep clone and revive the org aggregated usage object behavior
  const newa = a ?
    extend(reviveOrgV2(JSON.parse(JSON.stringify(a))), {
      account_id: account.account_id,
      end: u.end
    }) :
    extend(newOrgV2(u.organization_id), {
      start: u.start,
      end: u.end,
      account_id: account.account_id
    });

  // Retrieve the pricing country configured for the org's account
  const country = !account.pricing_country ?
    'USA' : account.pricing_country;
  debug('Pricing country %o', country);

  // Get meter resource configuration
  const mconf = yield meterConfig(u.resource_id, u.end,
    systemToken && systemToken());
  const mplan = filter(mconf.metering_plans, (m) =>
    m.metering_plan_id === u.metering_plan_id)[0];

  const pconf = yield pricesV2(u.resource_id, u.end, u.price_id,
    systemToken && systemToken());

  // Get rate resource configuration
  const rconf = yield rateConfig(u.resource_id, u.end,
    systemToken && systemToken());
  const rplan = filter(rconf.rating_plans, (r) =>
    r.rating_plan_id === u.rating_plan_id)[0];

  // Go through the incoming accumulated usage metrics
  map(u.accumulated_usage, (ua) => {
    // Find the aggregate function for the given metric
    const afn = aggrfn(mplan.metrics, ua.metric);

    // Find the rate function for the given metric
    const rfn = ratefn(rplan.metrics, ua.metric);

    // Find the price for the given rating plan, metric and country
    const rp = priceV2(pconf, u.rating_plan_id, ua.metric, country);

    const aggr = (am, addCost) => {
      // We're mutating the input windows property here
      // but it's really the simplest way to apply the aggregation formula
      am.windows = map(am.windows, (w, i) => {
        // Get the time difference between the new and old processed time
        const timediff = Math.floor(newend / timescale[i]) -
          Math.floor(oldend / timescale[i]);

        // Calculate the slack index in case a slack is set
        const si = Math.max(Math.floor(newend / timescale[i])
          - Math.floor(docend / timescale[i]), 0);

        // If the number of slack windows in the aggregated usage is less than
        // the number in the incoming accumulated usage, push until they equal
        if(w.length < ua.windows[i].length)
          map(Array(ua.windows[i].length - w.length), () =>
            w.push(null));

        // Push older windows down the slack list
        if(a && timediff > 0)
          shift(new Date(a.processed), new Date(u.processed), w, i);

        /* eslint complexity: [1, 6] */
        const quantities = map(w, (q, j) => {
          // Instead of returning undefined or null,
          // returning previously aggregated quantity
          // TODO: Calculation has to use slack window to determine
          // what to do here
          if(!ua.windows[i][j] || si !== j)
            return q;

          if(timediff > 0)
            return {
              quantity: afn(0, ua.windows[i][j].quantity.previous || 0,
                ua.windows[i][j].quantity.current)
            };

          return {
            quantity: afn(q && q.quantity || 0,
              ua.windows[i][j].quantity.previous || 0,
              ua.windows[i][j].quantity.current)
          };
        });

        return addCost ? map(quantities, (q) => q ?
          extend(q, { cost: q.quantity ?
            rfn(rp, q.quantity) : 0 }) : null) : quantities;
      });

    };
    // Apply the aggregate function to the aggregated usage tree
    aggr(
      newa.resource(u.resource_id).metric(ua.metric), false);
    aggr(
      newa.resource(u.resource_id).metering_plan(u.metering_plan_id)
      .metric(ua.metric), false);
    aggr(
      newa.resource(u.resource_id).metering_plan(u.metering_plan_id)
      .rating_plan(u.rating_plan_id).metric(ua.metric), false);
    aggr(
      newa.resource(u.resource_id).metering_plan(u.metering_plan_id)
      .rating_plan(u.rating_plan_id).price(u.price_id).metric(ua.metric),
      true);
    aggr(
      newa.space(u.space_id).resource(u.resource_id)
      .metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).resource(u.resource_id).metering_plan(
      u.metering_plan_id).metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).resource(u.resource_id).metering_plan(
      u.metering_plan_id).rating_plan(u.rating_plan_id).metric(ua.metric),
      false);
    aggr(
      newa.space(u.space_id).resource(u.resource_id).metering_plan(
      u.metering_plan_id).rating_plan(u.rating_plan_id).price(u.price_id)
      .metric(ua.metric), true);
    aggr(
      newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN')
        .resource(u.resource_id).metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN')
        .resource(u.resource_id).metering_plan(u.metering_plan_id).
          metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN')
        .resource(u.resource_id).metering_plan(u.metering_plan_id).
          rating_plan(u.rating_plan_id).metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN')
        .resource(u.resource_id).metering_plan(u.metering_plan_id).
          rating_plan(u.rating_plan_id).price(u.price_id)
            .metric(ua.metric), true);
  });

  // Remove aggregated usage object behavior and return
  const jsa = JSON.parse(JSON.stringify(newa));
  debug('New aggregated usage %o', jsa);
  return jsa;
};

// Aggregate the given accumulated usage
// Process a group of usage docs and compute the corresponding
// aggregated usage
const aggregateUsageV2 = function *(aggr, udocs) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield aggregateV2(last(log)[0], udoc);
    return log.concat([[res]]);

  }, [[
    aggr
  ]]);
  return rest(ologs);
}

// Create an aggregator service app
const aggregator = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v[1-2]\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const reducer = dataflow.reducer(aggregateUsage, {
    input: {
      type: 'accumulated_usage',
      post: '/v1/metering/accumulated/usage',
      get: '/v1/metering/accumulated/usage/t/:tseq/k/:korganization_id',
      dbname: 'abacus-aggregator-accumulated-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      group: igroup,
      time: itime
    },
    output: {
      type: 'aggregated_usage',
      get: '/v1/metering/aggregated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-aggregated-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.sink,
      apps: process.env.AGGREGATOR_SINK_APPS,
      post: '/v1/metering/aggregated/usage',
      authentication: systemToken
    }
  });

  const reducerV2 = dataflow.reducer(aggregateUsageV2, {
    input: {
      type: 'accumulated_usage_v2',
      post: '/v2/metering/accumulated/usage',
      get: '/v2/metering/accumulated/usage/t/:tseq/k/:korganization_id',
      dbname: 'abacus-aggregator-accumulated-usage-v2',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      group: igroup,
      time: itime
    },
    output: {
      type: 'aggregated_usage_v2',
      get: '/v2/metering/aggregated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-aggregated-usage-v2',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.sink,
      apps: process.env.AGGREGATOR_SINK_APPS,
      post: '/v2/metering/aggregated/usage',
      authentication: systemToken
    }
  });

  app.use(reducer);
  app.use(reducerV2);
  app.use(router.batch(app));

  app.reducer = reducer;
  app.reducerV2 = reducerV2;
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  // Create the app, replay any failed events, and listen
  const app = aggregator();
  dataflow.replay(app.reducer, 0, () => {
    app.listen();
  });
};

// Export our public functions
module.exports = aggregator;
module.exports.newOrg = newOrg;
module.exports.newOrgV2 = newOrgV2;
module.exports.reviveOrg = reviveOrg;
module.exports.reviveOrgV2 = reviveOrgV2;
module.exports.runCLI = runCLI;
