'use strict';

const cp = require('child_process');
const _ = require('underscore');

const commander = require('commander');

const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const dataflow = require('abacus-dataflow');
const yieldable = require('abacus-yieldable');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const map = _.map;
const reduce = _.reduce;
const range = _.range;
const clone = _.clone;
const zip = _.zip;
const unzip = _.unzip;
const flatten = _.flatten;
const omit = _.omit;

// Batch the requests
const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-reporting-itest');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-reporting-itest');
commander
  .option('-o, --orgs <n>', 'number of thousands of organizations', parseInt)
  .option('-i, --instances <n>', 'number of resource instances', parseInt)
  .option('-u, --usagedocs <n>', 'number of usage docs', parseInt)
  .option('-d, --day <d>',
    'usage time shift using number of days', parseInt)
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// Number of thousands of organizations
const orgs = (commander.orgs || 1) * 10;

// Number of resource instances
const resourceInstances = commander.instances || 1;

// Number of usage docs
const usage = commander.usagedocs || 1;

// Usage time shift by number of days in milli-seconds
const tshift = commander.day * 24 * 60 * 60 * 1000 || 0;

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 30000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// Extend an object using an interceptor
// if interceptor returns a value, then use it to replace the original value
const cextend = (o, interceptor) => {
  const deepcopy = (k, v) => {
    // if value is an object, then extend it using the interceptor
    if(typeof v === 'object') return cextend(v, interceptor);
    return v;
  };

  // Go through object keys and extend
  map(o, (v, k) => {
    o[k] = interceptor(k, v) || deepcopy(k, v);
  });
  return o;
};

// plan and price details for test-resource to do a quick lookup
const cost = {
  basic: {
    storage: 1,
    'thousand_light_api_calls': 0.03,
    'heavy_api_calls': 0.15
  },
  standard: {
    storage: 0.5,
    'thousand_light_api_calls': 0.04,
    'heavy_api_calls': 0.18
  }
};

// Add windows to aggregated usage at all non-plan levels
const addResourceWindows = (r) => {
  r.aggregated_usage = map(r.aggregated_usage, (u) => ({
    metric: u.metric,
    windows: map(u.quantity, (w) => {
      return map(w, (q) => ({
        quantity: q
      }));
    })
  }));
  return r;
};

// Add windows to the entire aggregated usage object
const addWindows = (u) => {
  u.resources = map(u.resources, addResourceWindows);
  map(u.spaces, (s) => {
    s.resources = map(s.resources, addResourceWindows);
    map(s.consumers, (c) => {
      if(c.resources)
        c.resources = map(c.resources, addResourceWindows);
    });
  });
  return u;
};

// Add cost to aggregated usage at all plan levels
const addCost = (k, v) => {
  // all plan level aggregations need cost as part of aggregated_usage
  if (k === 'plans') map(v, (p) => {
    // Warning: mutating aggregated_usage to include cost
    p.aggregated_usage = map(p.aggregated_usage, (u) => ({
      metric: u.metric,
      windows: map(u.quantity, (w) => {
        return map(w, (q) => ({
          quantity: q,
          cost: new BigNumber(q).mul(cost[p.plan_id.split('/')[0]]
            [u.metric]).toNumber()
        }));
      })
    }));

    return p;
  });
};

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => {
  a.charge = new BigNumber(a.charge).add(m.charge ? m.charge : 0).toNumber();
  return a;
};

// Add charge, and summary to aggregated_usage at all resources and
// all plan levels
const addCharge = (k, v) => {
  if (k === 'resources') map(v, (r) => {
    // Calculate plan level charges
    r.plans = map(r.plans, (p) => {
      p.aggregated_usage = map(p.aggregated_usage, (u) => {
        map(u.windows, (w) => {
          map(w, (wi) => {
            wi.charge = wi.cost;
            wi.summary = wi.quantity;
          });
        });
        return u;
      });

      // Total charge for a plan
      p.windows = map(zip.apply(_, map(p.aggregated_usage, (u) => {
        return u.windows;
      })),
        (zu) => {
          return map(unzip(zu), (uu) => {
            return reduce(uu, sumCharges, { charge: 0 });
          });
        });
      return p;
    });

    // Calculate resource level charges using plan level charges
    map(r.aggregated_usage, (u) => {
      map(u.windows, (w, i) => {
        map(w, (wi, j) => {
          wi.charge = reduce(r.plans, (a, p) =>
            new BigNumber(a).add(reduce(p.aggregated_usage, (a1, u1) =>
              new BigNumber(a1).add(u1.metric === u.metric ?
                u1.windows[i][j].charge : 0).toNumber(),
                  0)).toNumber(), 0);
        });
      });
    });

    // Total charges for a resource
    r.windows = map(zip.apply(_, map(r.plans, (p) => {
      return p.windows;
    })),
      (zu) => {
        return map(unzip(zu), (uu) => {
          return reduce(uu, sumCharges, { charge: 0 });
        });
      });
    return r;
  });
};

// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = (t) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * 100000000
    + d.getUTCDate() * 1000000 + d.getUTCHours() * 10000 + d.getUTCMinutes()
    * 100 + d.getUTCSeconds();
};

// Converts a number output in dateUTCNumbify back to a Date object
const revertUTCNumber = (n) => {
  const numstring = n.toString();
  const d = new Date(Date.UTC(
    numstring.substring(0, 4),
    numstring.substring(4, 6),
    numstring.substring(6, 8),
    numstring.substring(8, 10),
    numstring.substring(10, 12),
    numstring.substring(12)
  ));
  return d;
};

// Scaling factor for a time window
// [Second, Minute, Hour, Day, Month, Year, Forever]
const timescale = [1, 100, 10000, 1000000, 100000000];

// Builds the quantity array in the aggregated usage
const buildAggregatedQuantity = (p, u, ri, tri, count, end, f) => {
  const quantity = map(timescale, (ts) => {
    const time = end + u;
    const timeNum = dateUTCNumbify(time);
    const windowTimeNum = Math.floor(timeNum / ts) * ts;

    // Get the millisecond equivalent of the very start of the given window
    const windowTime = revertUTCNumber(windowTimeNum).getTime();
    return [f(p, Math.min(time - windowTime, u), ri, tri, count)];
  });
  return quantity;
};

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

describe('abacus-usage-reporting-itest', () => {
  before((done) => {
    const start = (module) => {
      const c = cp.spawn('npm', ['run', 'start'],
        { cwd: moduleDir(module), env: clone(process.env) });

      // Add listeners to stdout, stderr and exit messsage and forward the
      // messages to debug logs
      c.stdout.on('data', (d) => process.stdout.write(d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('exit', (c) => debug('Application exited with code %d', c));
    };

    const services = () => {
      // Start account plugin
      start('abacus-account-plugin');

      // Start usage reporting service
      start('abacus-usage-reporting');

      done();
    };

    // Start local database server
    if (!process.env.DB) {
      start('abacus-pouchserver');
      services();
    }
    else
      // Delete test dbs on the configured db server
      dbclient.drop(process.env.DB,
        /^abacus-aggregator-|^abacus-accumulator-/, () => {
          services();
        });
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage reporting service
    stop('abacus-usage-reporting');

    // Stop account plugin
    stop('abacus-account-plugin');

    // Stop local database server
    if (!process.env.DB)
      stop('abacus-pouchserver');
  });

  it('report rated usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, or
    // a predefined timeout
    const timeout = Math.max(totalTimeout,
      100 * (orgs / 1000) * resourceInstances * usage);
    this.timeout(timeout + 2000);

    // Initialize usage doc properties with unique values
    const end = 1435629465220 + tshift;

    // Produce usage for two spaces in an organization, two consumers
    // in a space and create resource instances using two resource plans
    // at each space.

    // Usage template index values for a given org
    //  Usage  ResourceInstance  Space Plan Consumer(with space)
    //    0           0            0    0        0-0
    //    0           1            1    0        1-0
    //    0           2            0    1        0-0
    //    0           3            1    1        1-0
    //    0           4            0    0        0-1
    //    0           5            1    0        1-1
    //    0           6            0    1        0-1
    //    0           7            1    1        1-1
    //    0           8            0    0        0-0
    //    0           9            1    0        1-0
    //    0          10            0    1        0-0
    //    1           0            0    0        0-0
    //    1           1            1    0        1-0

    // Organization id based on org index
    const oid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      o + 1].join('-');

    // One of the two spaces at a given org based on resource instance index
    const sid = (o, ri) => ['aaeae239-f3f8-483c-9dd0-de5d41c38b6b',
      o + 1, ri % 2 === 0 ? 1 : 2].join('-');

    // One of the two consumers at a given org and derived space based on
    // resource instance index
    const cid = (o, ri) => ['bbeae239-f3f8-483c-9dd0-de6781c38bac',
      o + 1, ri % 2 === 0 ? 1 : 2, ri % 8 < 4 ? 1 : 2].join('-');

    // One of the two plans based on resource instance index
    const pid = (ri) => ri % 4 < 2 ? 'basic' : 'standard';

    // The metering plan id
    const mpid = (ri) => 'test-metering-plan';

    // One of the two rating plans based on resource instance index
    const ppid = (ri) => ri % 4 < 2 ? 'test-pricing-basic' :
      'test-pricing-standard';

    // One of the two pricing plans based on resource instance index
    const rpid = (ri) => ri % 4 < 2 ? 'test-rating-plan' :
      'test-rating-plan-standard';

    // Use number sequences to find expected aggregated value at any given
    // resource instance index and a given usage index based on the generated
    // accumulated usage.

    // Total resource instances index
    const tri = resourceInstances - 1;

    // Create an array of objects based on a range and a creator function
    const create = (number, creator) =>
      map(range(number()), (i) => creator(i));

    // Aggregate metrics based on ressource instance, usage and plan indices
    // For max, we use either the current count or the totat count based on
    // resource instance index
    // For sum, we use current count + total count based on resource instance
    // and usage index
    const a = (ri, u, p, count) => [
      { metric: 'storage',
        quantity: buildAggregatedQuantity(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) =>
            10 * (u === 0 ? count(ri, p) : count(tri, p))) },
      { metric: 'thousand_light_api_calls',
        quantity: buildAggregatedQuantity(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) =>
            1000 * (count(ri, p) + u * count(tri, p))) },
      { metric: 'heavy_api_calls',
        quantity: buildAggregatedQuantity(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) =>
            100 * (count(ri, p) + u * count(tri, p))) }
    ];

    // Resouce plan level aggregations for a given consumer at given space
    const scpagg = (o, ri, u, s, c) => {
      // Resource instance index shift to locate a value at count number
      // sequence specified below
      const shift = (p) =>
        (s === 0 ? c === 0 ? 8 : 4 : c === 0 ? 7 : 3) - (p === 0 ? 0 : 2);

      // Number sequence representing count for a given space, consumer and
      // plan based on specified spread using id generators
      // 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
      // 2, 2, 2, 2, 2, 2, 2, 2, 3, ......
      const count = (n, p) => Math.round((n + shift(p)) / 8 - 0.50);

      // Number of plans at a given space, consumer and
      // resource instance indices
      const plans = () => u === 0 && ri <= (c === 0 ? 1 + s : 5 + s) ||
        tri <= (c === 0 ? 1 + s : 5 + s) ? 1 : 2;

      // Create plan aggregations
      return create(plans, (i) => {
        const planId = pid(i === 0 ? 0 : 2);
        const meteringPlanId = mpid(i === 0 ? 0 : 2);
        const ratingPlanId = rpid(i === 0 ? 0 : 2);
        const pricingPlanId = ppid(i === 0 ? 0 : 2);
        return {
          plan_id: [planId, meteringPlanId, ratingPlanId,
            pricingPlanId].join('/'),
          metering_plan_id: meteringPlanId,
          rating_plan_id: ratingPlanId,
          pricing_plan_id: pricingPlanId,
          aggregated_usage: a(ri, u, i, count)
        };
      });
    };

    // Consumer level resource aggregations for a given space
    const cagg = (o, ri, u, s, id) => {
      // Resource instance index shift
      const shift = (c) => (s === 0 ? 6 : 5) - (c === 0 ? 0 : 4);

      // Number sequence of count
      // 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4,
      // 5, 5, 6, .....
      const count = (n, c) => {
        const nri = n + shift(c);
        return 2 * Math.round(nri / 8 - 0.50) + (nri % 8 < 6 ? 0 : 1);
      };

      // Number of consumers at a given resource instance and space indices
      const consumers = () => u === 0 && ri <= 3 + s || tri <= 3 + s ? 1 : 2;

      // Create resource aggregations
      return create(consumers, (i) => {
        const consumer = {
          organization_id: oid(o),
          resource_instance_id: 'rid',
          start: end + u,
          end: end + u,
          consumer_id: cid(o, i === 0 ? s : s === 0 ? 4 : 5),
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: a(ri, u, i, count),
            plans: scpagg(o, ri, u, s, i)
          }]
        };
        if(id)
          consumer.id = dbclient.kturi([oid(o), sid(o, s),
            cid(o, i === 0 ? s : s === 0 ? 4 : 5)].join('/'), end + u);
        return consumer;
      });
    };

    // Consumer level resource aggregations for a given space
    const scagg = (o, ri, u, s, c) => {
      // Number of consumers at a given resource instance and space indices
      const consumers = () => u === 0 && ri <= 3 + s || tri <= 3 + s ? 1 : 2;

      // Create resource aggregations only if true, otherwise, return the id
      if(c)
        return cagg(o, ri, u, s);
      return create(consumers, (i) => ({
        id: cid(o, i === 0 ? s : s === 0 ? 4 : 5),
        t: dbclient.pad16(end + u)
      }));
    };

    // Resource plan level aggregations for a given space
    const spagg = (o, ri, u, s) => {
      // resource instance index shift
      const shift = (p) => (s === 0 ? 3 : 2) - (p === 0 ? 0 : 2);

      // Number sequence of count
      // 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, ......
      const count = (n, p) => Math.round((n + shift(p)) / 4 - 0.25);

      // Number of plans at a given resource instance and space indices
      const plans = () => u === 0 && ri <= 1 + s || tri <= 1 + s ? 1 : 2;

      // Create plan level aggregations
      return create(plans, (i) => {
        const planId = pid(i === 0 ? 0 : 2);
        const meteringPlanId = mpid(i === 0 ? 0 : 2);
        const ratingPlanId = rpid(i === 0 ? 0 : 2);
        const pricingPlanId = ppid(i === 0 ? 0 : 2);
        return {
          plan_id: [planId, meteringPlanId, ratingPlanId,
            pricingPlanId].join('/'),
          metering_plan_id: meteringPlanId,
          rating_plan_id: ratingPlanId,
          pricing_plan_id: pricingPlanId,
          aggregated_usage: a(ri, u, i, count)
        };
      });
    };

    // Space level resource aggregations for a given organization
    const osagg = (o, ri, u, c) => {
      // Resource instance index shift
      const shift = (s) => s === 0 ? 1 : 0;

      // Number sequence of count
      // 0, 1, 1, 2, 2, 3, 3, 4, 4,.....
      const count = (n, s) => Math.round((n + shift(s)) / 2);

      // Number of spaces at a given resource index
      const spaces = () => u === 0 && ri === 0 || tri === 0 ? 1 : 2;

      // Create resource instance aggregations
      return create(spaces, (i) => ({
        space_id: sid(o, i),
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: a(ri, u, i, count),
          plans: spagg(o, ri, u, i)
        }],
        consumers: scagg(o, ri, u, i, c)
      }));
    };

    // Resource plan level aggregations for a given organization
    const opagg = (o, ri, u) => {
      // Resource instance index shift
      const shift = (p) => p === 0 ? 2 : 0;

      // Number sequence of count
      // 0, 0, 1, 2, 2, 2, 3, 4, 4, 4, 5, 6, 6, 6, 7, 8, 8, 8, ...........
      const count = (n, p) => {
        const nri = n + shift(p);

        return Math.round(nri / 2 +
          (nri % 2 === 0 ? 0 : 0.5) * ((nri / 2 - 0.5) % 2 === 0 ? -1 : 1));
      };

      // Number of plans at a given resource instance index
      const plans = () => u === 0 && ri <= 1 || tri <= 1 ? 1 : 2;

      // Create plan aggregations
      return create(plans, (i) => {
        const planId = pid(i === 0 ? 0 : 2);
        const meteringPlanId = mpid(i === 0 ? 0 : 2);
        const ratingPlanId = rpid(i === 0 ? 0 : 2);
        const pricingPlanId = ppid(i === 0 ? 0 : 2);
        return {
          plan_id: [planId, meteringPlanId, ratingPlanId,
            pricingPlanId].join('/'),
          metering_plan_id: meteringPlanId,
          rating_plan_id: ratingPlanId,
          pricing_plan_id: pricingPlanId,
          aggregated_usage: a(ri, u, i, count)
        };
      });
    };

    // Rated usage for a given org, resource instance, usage indices, whether
    // to fill the consumer usage or not
    const ratedTemplate = (o, ri, u, c) => ({
      id: dbclient.kturi(oid(o), end + u),
      organization_id: oid(o),
      account_id: '1234',
      resource_instance_id: 'rid',
      consumer_id: 'cid',
      start: end + u,
      end: end + u,
      processed: end + u,
      resources: cextend([{
        resource_id: 'test-resource',
        aggregated_usage: a(ri, u, undefined, (n) => n + 1),
        plans: opagg(o, ri, u)
      }], addCost),
      spaces: cextend(osagg(o, ri, u, c), addCost)
    });
    // Rated usage for a given consumer
    const ratedConsumerTemplate = (o, ri, u) => {
      // Number of spaces at a given resource index
      const spaces = () => u === 0 && ri === 0 || tri === 0 ? 1 : 2;
      return flatten(map(create(spaces, (i) => cagg(o, ri, u, i, 1)), (s) => {
        map(s, (c) => {
          c.processed = end + u;
          c.resources = cextend(
            map(c.resources, addResourceWindows), addCost);
        });
        return s;
      }));
    };

    // Usage report for a given org, resource instance, usage indices
    const reportTemplate = (o, ri, u) => {
      // Add charge and summary at all resources and plan level aggregations
      const report = cextend(addWindows(ratedTemplate(o, ri, u, 1)), addCharge);

      // Add charge at organization, space and consumer levels
      report.windows = map(zip.apply(_, map(report.resources, (r) => {
        return r.windows;
      })), (zr) => {
        return map(unzip(zr), (uu) => {
          return reduce(uu, sumCharges, { charge: 0 });
        });
      });
      report.spaces = map(report.spaces, (s) => {
        s.windows = map(zip.apply(_, map(s.resources, (r) => {
          return r.windows;
        })), (zr) => {
          return map(unzip(zr), (uu) => {
            return reduce(uu, sumCharges, { charge: 0 });
          });
        });
        s.consumers = map(s.consumers, (c) => {
          c.windows = map(zip.apply(_, map(c.resources, (r) => {
            return r.windows;
          })), (zr) => {
            return map(unzip(zr), (uu) => {
              return reduce(uu, sumCharges, { charge: 0 });
            });
          });
          return omit(c, 'resource_instance_id', 'organization_id', 'start',
            'end');
        });
        return s;
      });
      return omit(report, 'resource_instance_id', 'consumer_id');
    };


    // Post rated usage doc, throttled to default concurrent requests
    const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage');
    const dbput = yieldable.functioncb(aggregatordb.put);
    const dbbulk = yieldable.functioncb(aggregatordb.bulkDocs);

    const post = throttle((o, ri, u, cb) => {
      debug('Submit rated usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      dbput(addWindows(ratedTemplate(o, ri, u)), (err, val) => {
        debug('Verify rated usage for org%d', o + 1);

        expect(err).to.equal(null);
        expect(val).to.not.equal(undefined);

        debug('Verified rated usage for org%d', o + 1);
        dbbulk(ratedConsumerTemplate(o, ri, u), {}, (err, val) => {
          debug('Verify rated consumer usage for org%d', o + 1);

          expect(err).to.equal(null);
          expect(val).to.not.equal(undefined);

          debug('Verified rated consumer usage for org%d', o + 1);
          cb();
        });
      });
    });

    // Post the requested number of organizations usage
    const submit = (done) => {
      let posts = 0;
      const cb = () => {
        if(++posts === orgs) done();
      };

      // Submit usage for all organizations
      map(range(orgs), (o) => post(o, resourceInstances - 1, usage - 1, cb));
    };

    // Get usage report, throttled to default concurrent requests
    const get = throttle((o, ri, u, cb) => {
      debug('Get rated usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      brequest.get(
        'http://localhost::port/v1/metering/organizations' +
        '/:organization_id/aggregated/usage/:time', {
          port: 9088,
          organization_id: oid(o),
          time: end + usage
        }, (err, val) => {
          debug('Verify usage report for org%d', o + 1);

          expect(err).to.equal(undefined);
          expect(val.body).to.deep.equal(reportTemplate(o, ri, u));

          debug('Verified usage report for org%d', o + 1);

          cb();
        });
    });

    const verifyReporting = (done) => {
      let gets = 0;
      const cb = () => {
        if(++gets === orgs) done();
      };

      // Get usage report for all organizations
      map(range(orgs), (o) => get(o, resourceInstances - 1, usage - 1, cb));
    };

    // Wait for usage reporting service to start
    request.waitFor('http://localhost::p/batch',
      { p: 9088 }, startTimeout, (err, value) => {
        // Failed to ping usage reporting service before timing out
        if (err) throw err;

        // Submit organization usage  and verify
        submit(() => verifyReporting(done));
      });
  });
});
