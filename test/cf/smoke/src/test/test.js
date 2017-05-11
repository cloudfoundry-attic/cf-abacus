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
const moment = require('abacus-moment');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'smoke');
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

// The current time
const now = moment.utc().toDate();

// Use secure routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Token fetchers
const objectStorageToken = secured() ? oauth.cache(authServer,
    process.env.OBJECT_STORAGE_CLIENT_ID,
    process.env.OBJECT_STORAGE_CLIENT_SECRET,
    'abacus.usage.object-storage.write') :
  undefined;
const systemToken = secured() ? oauth.cache(authServer,
    process.env.SYSTEM_CLIENT_ID, process.env.SYSTEM_CLIENT_SECRET,
    'abacus.usage.read') :
  undefined;

// Builds the expected window value based upon the
// charge summary, quantity, cost, and window
const buildWindow = (ch, s, q, c) => {
  const addProperty = (key, value, obj) => {
    if(typeof value !== 'undefined')
      obj[key] = value;
  };
  const win = {};
  addProperty('charge', ch, win);
  addProperty('summary', s, win);
  addProperty('quantity', q, win);
  addProperty('cost', c, win);
  return win;
};

// Compares the previous and expected window values based upon the
// charge summary, quantity, cost, and window delta
const deltaCompare = (currentWindow, previousWindow, ch, s, q, c) => {
  expect(currentWindow).to.not.equal(undefined, 'Missing current window');
  expect(previousWindow).to.not.equal(undefined, 'Missing previous window');

  const checkIfNear = (key, increment, current, previous) => {
    if(typeof increment !== 'undefined' &&
      typeof current[key] !== 'undefined' &&
      typeof previous[key] !== 'undefined') {

      const currentValue = current[key];
      const previousValue = previous[key];
      let message = util.format('No change in %s=%d detected',
        key, previousValue);
      expect(currentValue).to.not.equal(previousValue, message);

      const diff = currentValue - previousValue - increment;
      message = util.format('%s=%d, expected increase %d from %d, ∆=%d',
        key, currentValue, increment, previousValue, diff);
      expect(Math.abs(diff)).to.be.below(0.01, message);
    }
  };
  checkIfNear('charge', ch, currentWindow, previousWindow);
  checkIfNear('summary', s, currentWindow, previousWindow);
  checkIfNear('quantity', q, currentWindow, previousWindow);
  checkIfNear('cost', c, currentWindow, previousWindow);
};

// Prunes all the windows of everything but the monthly charge
const prune = (v, k) => {
  if(k === 'windows') {
    const nwin = {};
    const sumWindowValue = (w1, w2, k) => {
      nwin[k] = 0;
      if(w1 && typeof w1[k] !== 'undefined')
        nwin[k] += w1[k];
      if(w2 && typeof w2[k] !== 'undefined')
        nwin[k] += w2[k];
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

describe('abacus-smoke-test', function() {
  before(() => {
    if (objectStorageToken)
      objectStorageToken.start();
    if (systemToken)
      systemToken.start();
  });

  it('submits usage for a sample resource and retrieves an aggregated ' +
    'usage report', function(done) {

    // Configure the test timeout
    const timeout = Math.max(totalTimeout, 40000);
    const processingDeadline = moment.now() + timeout;
    this.timeout(timeout + 2000);
    console.log('Test will run until %s',
      moment.utc(processingDeadline).toDate());

    // Test usage to be submitted by the client
    const buildUsage = (time) => ({
      message:
        'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
      usage: {
        start: time,
        end: time,
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
    });

    const usage = [];
    _(3).times((n) => {
      usage.push(buildUsage(now.getTime() + n));
    });

    // Initial expected usage report for the test organization
    const initialExpectedReport = {
      organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      account_id: '1234',
      windows: buildWindow(46.09),
      resources: [{
        resource_id: 'object-storage',
        windows: buildWindow(46.09),
        aggregated_usage: [{
          metric: 'storage',
          windows: buildWindow(1)
        }, {
          metric: 'thousand_light_api_calls',
          windows: buildWindow(0.09)
        }, {
          metric: 'heavy_api_calls',
          windows: buildWindow(45)
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
            windows: buildWindow(1)
          }, {
            metric: 'thousand_light_api_calls',
            windows: buildWindow(0.09)
          }, {
            metric: 'heavy_api_calls',
            windows: buildWindow(45)
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
              windows: buildWindow(1)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(0.09)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(45)
            }],
            plans: [{
              plan_id: 'basic/basic-object-storage/' +
              'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              windows: buildWindow(46.09),
              resource_instances: [{
                id: '0b39fa70-a65f-4183-bae8-385633ca5c87'
              }],
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
      console.log('%s: %s', u.usage.start, u.message);

      const cb = () => {
        if(++posts === usage.length) done();
      };

      request.post(collector + '/v1/metering/collected/usage',
        extend({ body: u.usage }, authHeader(objectStorageToken)),
          (err, val) => {
            expect(err).to.equal(undefined, util.format('Error: %o', err));

            // Expect a 201 with the location of the accumulated usage
            expect(val.statusCode).to.equal(201,
              util.format('Response code: %d; headers: %j; body: %j',
                val.statusCode, val.headers, val.body));
            expect(val.headers.location).to.not.equal(undefined);
            cb();
          });
    };

    // Print the number of usage docs already processed given a get report
    // response, determined from the aggregated usage quantity found in the
    // report for our test resource
    const processed = (val) => {
      try {
        return val.body.resources[0].plans[0].
          aggregated_usage[1].windows[4][0].quantity;
      }
      catch (e) {
        // The response doesn't contain a valid report
        return 0;
      }
    };

    const deltaCompareReports = (updatedReport, previousReport) => {
      deltaCompare(updatedReport.windows, previousReport.windows, 45.09);

      deltaCompare(updatedReport.resources[0].windows,
        previousReport.resources[0].windows, 45.09);

      deltaCompare(updatedReport.resources[0].aggregated_usage[1].windows,
        previousReport.resources[0].aggregated_usage[1].windows, 0.09);
      deltaCompare(updatedReport.resources[0].aggregated_usage[2].windows,
        previousReport.resources[0].aggregated_usage[2].windows, 45);

      deltaCompare(updatedReport.resources[0].plans[0].windows,
        previousReport.resources[0].plans[0].windows, 45.09);
      deltaCompare(updatedReport.resources[0].plans[0]
        .aggregated_usage[1].windows,
        previousReport.resources[0].plans[0]
        .aggregated_usage[1].windows, 0.09, 3, 3, 0.09);
      deltaCompare(updatedReport.resources[0].plans[0]
        .aggregated_usage[2].windows,
        previousReport.resources[0].plans[0]
        .aggregated_usage[2].windows, 45, 300, 300, 45);

      deltaCompare(updatedReport.spaces[0].windows,
        previousReport.spaces[0].windows, 45.09);

      deltaCompare(updatedReport.spaces[0].resources[0].windows,
        previousReport.spaces[0].resources[0].windows, 45.09);
      deltaCompare(updatedReport.spaces[0].resources[0]
        .aggregated_usage[1].windows,
        previousReport.spaces[0].resources[0]
        .aggregated_usage[1].windows, 0.09);
      deltaCompare(updatedReport.spaces[0].resources[0]
        .aggregated_usage[2].windows,
        previousReport.spaces[0].resources[0]
        .aggregated_usage[2].windows, 45);

      deltaCompare(updatedReport.spaces[0].resources[0].plans[0].windows,
        previousReport.spaces[0].resources[0].plans[0].windows, 45.09);
      deltaCompare(updatedReport.spaces[0].resources[0].plans[0]
        .aggregated_usage[1].windows,
        previousReport.spaces[0].resources[0].plans[0]
        .aggregated_usage[1].windows, 0.09, 3, 3, 0.09);
      deltaCompare(updatedReport.spaces[0].resources[0].plans[0]
        .aggregated_usage[2].windows,
        previousReport.spaces[0].resources[0].plans[0]
        .aggregated_usage[2].windows, 45, 300, 300, 45);

      deltaCompare(updatedReport.spaces[0].consumers[0].windows,
        previousReport.spaces[0].consumers[0].windows, 45.09);

      deltaCompare(updatedReport.spaces[0].consumers[0].resources[0].windows,
        previousReport.spaces[0].consumers[0].resources[0].windows, 45.09);
      deltaCompare(updatedReport.spaces[0].consumers[0].resources[0]
        .aggregated_usage[1].windows,
        previousReport.spaces[0].consumers[0].resources[0]
        .aggregated_usage[1].windows, 0.09);
      deltaCompare(updatedReport.spaces[0].consumers[0].resources[0]
        .aggregated_usage[2].windows,
        previousReport.spaces[0].consumers[0].resources[0]
        .aggregated_usage[2].windows, 45);

      deltaCompare(updatedReport.spaces[0].consumers[0].resources[0].plans[0]
        .windows,
        previousReport.spaces[0].consumers[0].resources[0].plans[0]
        .windows, 45.09);
      deltaCompare(updatedReport.spaces[0].consumers[0].resources[0].plans[0]
        .aggregated_usage[1].windows,
        previousReport.spaces[0].consumers[0].resources[0].plans[0]
        .aggregated_usage[1].windows, 0.09, 3, 3, 0.09);
      deltaCompare(updatedReport.spaces[0].consumers[0].resources[0].plans[0]
        .aggregated_usage[2].windows,
        previousReport.spaces[0].consumers[0].resources[0].plans[0]
        .aggregated_usage[2].windows, 45, 300, 300, 45);
    };

    // Get a usage report for the test organization
    const getReport = (cb) => {
      request.get([
        reporting,
        'v1/metering/organizations',
        'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        'aggregated/usage'
      ].join('/'), extend({}, authHeader(systemToken)), (err, val) => {
        expect(err).to.equal(undefined, util.format('Error: %o', err));
        expect(val.statusCode).to.equal(200,
          util.format('Response code: %d; headers: %j; body: %j',
            val.statusCode, val.headers, val.body));

        const actual = clone(omit(val.body,
          'id', 'processed', 'processed_id', 'start', 'end'), prune);

        cb(actual, processed(val));
      });
    };

    // Compare the usage report we got with the expected report
    const compareReport = (previousReport, processedDocs, done) => {
      getReport((updatedReport) => {
        try {
          updatedReport.spaces[0].consumers[0].resources[0].plans[0]
            .resource_instances[0] = omit(updatedReport.spaces[0].consumers[0]
            .resources[0].plans[0].resource_instances[0], 't', 'p');

          if (processedDocs != 0)
            deltaCompareReports(updatedReport, previousReport);
          else
            expect(updatedReport).to.deep.equal(initialExpectedReport);
          console.log('\nUpdated report:\n', util.inspect(updatedReport, {
            depth: 20
          }), '\n');
          done();
        }
        catch (e) {
          // If the comparison fails we'll be called again to retry
          // after 250 msec, give up after the configured timeout as
          // if we're still not getting the expected report then
          // the processing of the submitted usage must have failed
          if(moment.now() >= processingDeadline) {
            console.log('%s: All submitted usage still not processed\n',
              moment.utc().toDate());
            if (processedDocs != 0)
              deltaCompareReports(updatedReport, previousReport);
            else
              expect(updatedReport).to.deep.equal(initialExpectedReport);
          }
          else
            setTimeout(() => compareReport(previousReport, done), 250);
        }
      });
    };

    // Wait for the expected usage report, get a report every 250 msec env until
    // we get the expected values indicating that all submitted usage has
    // been processed
    const wait = (previousReport, processedDocs, done) => {
      console.log('\n%s: Retrieving usage report', moment.utc().toDate());
      compareReport(previousReport, processedDocs, done);
    };

    // Wait for usage reporter to start
    request.waitFor(reporting + '/batch', {}, startTimeout, (err) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      console.log('\n%s: Retrieving current report', moment.utc().toDate());
      getReport((report, processed) => {
        console.log('\n%s: Report after %d processed usage docs:\n%s\n',
          moment.utc().toDate(), processed,
          util.inspect(report, { depth: 20 }));

        // Post usage and wait for report
        map(usage, (u) => post(u, () => wait(report, processed, done)));
      });
    });
  });
});
