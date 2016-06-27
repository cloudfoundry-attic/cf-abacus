'use strict';

// Simulate a test service provider that submits usage for a resource and
// verifies the submission by retrieving a usage report.

const _ = require('underscore');
const map = _.map;
const omit = _.omit;
const extend = _.extend;

const request = require('abacus-request');
const util = require('util');
const commander = require('commander');
const clone = require('abacus-clone');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'demo');
commander
  .option('-c, --collector <uri>',
    'usage collector URL or domain name [http://localhost:9080]',
    'http://localhost:9080')
  .option('-r, --reporting <uri>',
    'usage reporting URL or domain name [http://localhost:9088]',
    'http://localhost:9088')
  .option('-a, --auth-server <uri>',
    'authentication server URL or domain name [http://localhost:9882]',
    'http://localhost:9882')
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// Collector service URL
const collector = /:/.test(commander.collector) ? commander.collector :
  'https://abacus-usage-collector.' + commander.collector;

// Reporting service URL
const reporting = /:/.test(commander.reporting) ? commander.reporting :
  'https://abacus-usage-reporting.' + commander.reporting;

// Auth server URL
const authServer = /:/.test(commander.authServer) ? commander.authServer :
'https://abacus-authserver-plugin.' + commander.authServer;

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// The current time + 1 hour into the future
const now = new Date(Date.now());

// Use secure routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Token fetcher
const token = secured() ? oauth.cache(authServer,
  process.env.CLIENT_ID, process.env.CLIENT_SECRET,
  'abacus.usage.object-storage.write abacus.usage.object-storage.read') :
  undefined;

// Builds the expected window value based upon the
// charge summary, quantity, cost, and window
const buildWindow = (ch, s, q, c) => {
  const addProperty = (k, v, o, z) => {
    if(typeof v !== 'undefined')
      o[k] = z ? 0 : v;
  };
  const win = {};
  addProperty('charge', ch, win);
  addProperty('summary', s, win);
  addProperty('quantity', q, win);
  addProperty('cost', c, win);
  return win;
};

// Prunes all the windows of everything but the monthly charge
const prune = (v, k) => {
  if(k === 'windows') {
    const nwin = {};
    const sumWindowValue = (w1, w2, k) => {
      if(typeof w1[k] !== 'undefined')
        nwin[k] = w2 ? w1[k] + w2[k] : w1[k];
    };
    sumWindowValue(v[4][0], v[4][1], 'charge');
    sumWindowValue(v[4][0], v[4][1], 'summary');
    sumWindowValue(v[4][0], v[4][1], 'cost');
    sumWindowValue(v[4][0], v[4][1], 'quantity');
    return nwin;
  }
  return v;
};

const authHeader = (token) => token ? {
  headers: {
    authorization: token()
  }
} : {};

describe('abacus-demo-client', function() {
  before((done) => {
    if (token)
      token.start();

    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-/, done);
  });

  it('submits usage for a sample resource and retrieves an aggregated ' +
    'usage report', (done) => {

    // Configure the test timeout
    const timeout = Math.max(totalTimeout, 40000);
    this.timeout(timeout + 2000);
    const processingDeadline = Date.now() + timeout;

    // Test usage to be submitted by the client
    const start = now.getTime();
    const end = now.getTime();
    const usage = [
      {
        message:
          'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
        usage: {
          start: start,
          end: end,
          organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          measured_usage: [{
            measure: 'storage',
            quantity: 1073741824
          }, {
            measure: 'light_api_calls',
            quantity: 1000
          }, {
            measure: 'heavy_api_calls',
            quantity: 100
          }]
        }
      },
      {
        message:
          'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
        usage: {
          start: start + 1,
          end: end + 1,
          organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          measured_usage: [{
            measure: 'storage',
            quantity: 1073741824
          }, {
            measure: 'light_api_calls',
            quantity: 1000
          }, {
            measure: 'heavy_api_calls',
            quantity: 100
          }]
        }
      },
      {
        message:
          'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
        usage: {
          start: start + 2,
          end: end + 2,
          organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          measured_usage: [{
            measure: 'storage',
            quantity: 1073741824
          }, {
            measure: 'light_api_calls',
            quantity: 1000
          }, {
            measure: 'heavy_api_calls',
            quantity: 100
          }]
        }
      }];

    // Expected usage report for the test organization
    const report = {
      organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      account_id: '1234',
      windows: buildWindow(46.09),
      resources: [{
        resource_id: 'object-storage',
        windows: buildWindow(46.09),
        aggregated_usage: [{
          metric: 'storage',
          windows: buildWindow(1, undefined, 1)
        }, {
          metric: 'thousand_light_api_calls',
          windows: buildWindow(0.09, undefined, 3)
        }, {
          metric: 'heavy_api_calls',
          windows: buildWindow(45, undefined, 300)
        }],
        plans: [{
          plan_id: 'basic/basic-object-storage/' +
            'object-rating-plan/object-pricing-basic',
          metering_plan_id: 'basic-object-storage',
          rating_plan_id: 'object-rating-plan',
          pricing_plan_id: 'object-pricing-basic',
          windows: buildWindow(46.09),
          aggregated_usage: [{
            metric: 'storage',
            windows: buildWindow(1, 1, 1, 1)
          }, {
            metric: 'thousand_light_api_calls',
            windows: buildWindow(0.09, 3, 3, 0.09)
          }, {
            metric: 'heavy_api_calls',
            windows: buildWindow(45, 300, 300, 45)
          }]
        }]
      }],
      spaces: [{
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        windows: buildWindow(46.09),
        resources: [{
          resource_id: 'object-storage',
          windows: buildWindow(46.09),
          aggregated_usage: [{
            metric: 'storage',
            windows: buildWindow(1, undefined, 1)
          }, {
            metric: 'thousand_light_api_calls',
            windows: buildWindow(0.09, undefined, 3)
          }, {
            metric: 'heavy_api_calls',
            windows: buildWindow(45, undefined, 300)
          }],
          plans: [{
            plan_id: 'basic/basic-object-storage/' +
              'object-rating-plan/object-pricing-basic',
            metering_plan_id: 'basic-object-storage',
            rating_plan_id: 'object-rating-plan',
            pricing_plan_id: 'object-pricing-basic',
            windows: buildWindow(46.09),
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(1, 1, 1, 1)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(0.09, 3, 3, 0.09)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(45, 300, 300, 45)
            }]
          }]
        }],
        consumers: [{
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          windows: buildWindow(46.09),
          resources: [{
            resource_id: 'object-storage',
            windows: buildWindow(46.09),
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(1, undefined, 1)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(0.09, undefined, 3)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(45, undefined, 300)
            }],
            plans: [{
              plan_id: 'basic/basic-object-storage/' +
                'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              windows: buildWindow(46.09),
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(1, 1, 1, 1)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(0.09, 3, 3, 0.09)
              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(45, 300, 300, 45)
              }]
            }]
          }]
        }]
      }]
    };

    // Submit usage for sample resource with 10 GB, 1000 light API calls,
    // and 100 heavy API calls
    let posts = 0;
    const post = (u, done) => {
      console.log(u.message);

      const cb = () => {
        if(++posts === usage.length) done();
      };

      request.post(collector + '/v1/metering/collected/usage',
        extend({ body: u.usage }, authHeader(token)), (err, val) => {
          expect(err).to.equal(undefined);

          // Expect a 201 with the location of the accumulated usage
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);
          cb();
        });
    };

    // Print the number of usage docs already processed given a get report
    // response, determined from the aggregated usage quantity found in the
    // report for our test resource
    const processed = (val) => {
      try {
        return val.body.resources[0].aggregated_usage[1].windows[4][0].quantity;
      }
      catch (e) {
        // The response doesn't contain a valid report
        return 0;
      }
    };

    // Get a usage report for the test organization
    const get = (done) => {
      request.get([
        reporting,
        'v1/metering/organizations',
        'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        'aggregated/usage'
      ].join('/'), extend({}, authHeader(token)), (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        // Compare the usage report we got with the expected report
        console.log('Processed %d usage docs', processed(val));
        const actual = clone(omit(val.body,
          'id', 'processed', 'processed_id', 'start', 'end'), prune);

        try {
          expect(actual).to.deep.equal(report);
          console.log('\n', util.inspect(val.body, {
            depth: 20
          }), '\n');
          done();
        }
        catch (e) {
          // If the comparison fails we'll be called again to retry
          // after 250 msec, give up after the configured timeout as
          // if we're still not getting the expected report then
          // the processing of the submitted usage must have failed
          if(Date.now() >= processingDeadline) {
            console.log('All submitted usage still not processed\n');
            expect(actual).to.deep.equal(report);
          }
          else
            setTimeout(() => get(done), 250);
        }
      });
    };

    // Wait for the expected usage report, get a report every 250 msec until
    // we get the expected values indicating that all submitted usage has
    // been processed
    const wait = (done) => {
      console.log('\nRetrieving usage report');
      get(done);
    };

    // Wait for usage reporter to start
    request.waitFor(reporting + '/batch', {}, startTimeout, (err, value) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      // Run the above steps
      map(usage, (u) => post(u, () => wait(done)));
    });
  });
});
