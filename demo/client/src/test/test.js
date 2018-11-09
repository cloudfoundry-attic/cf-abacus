'use strict';

// Simulate a test service provider that submits usage for a resource and
// verifies the submission by retrieving a usage report.

const { map, omit } = require('underscore');

const commander = require('commander');
const util = require('util');

const request = require('abacus-request');
const clone = require('abacus-clone');
const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'demo');
commander
  .option(
    '-c, --collector <uri>',
    'usage collector URL or domain name [http://localhost:9080]',
    'http://localhost:9080'
  )
  .option(
    '-r, --reporting <uri>',
    'usage reporting URL or domain name [http://localhost:9088]',
    'http://localhost:9088'
  )
  .option('-t, --start-timeout <n>', 'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>', 'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// Collector service URL
const collector = /:/.test(commander.collector)
  ? commander.collector
  : 'https://abacus-usage-collector.' + commander.collector;

// Reporting service URL
const reporting = /:/.test(commander.reporting)
  ? commander.reporting
  : 'https://abacus-usage-reporting.' + commander.reporting;

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// The current time
const now = moment.utc().toDate();

// Prunes all the windows of everything but the monthly summary & quantity
const prune = (v, k) => {
  if (k === 'windows') {
    const nwin = {};
    const sumWindowValue = (w1, w2, k) => {
      if (typeof w1[k] !== 'undefined') nwin[k] = w2 ? w1[k] + w2[k] : w1[k];
    };
    sumWindowValue(v[4][0], v[4][1], 'summary');
    sumWindowValue(v[4][0], v[4][1], 'quantity');
    return nwin;
  }
  return v;
};

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-demo-client', function() {
  before((done) => {
    console.log('Dropping all abacus collections except plans and plan-mappings ...');
    dbclient.drop(dbEnv, /^abacus-((?!plan).)*$/, done);
  });

  it('submits usage for a sample resource and retrieves an aggregated usage report', function(done) {
    // Configure the test timeout
    const timeout = Math.max(totalTimeout, 40000);
    this.timeout(timeout + 2000);
    const processingDeadline = moment.now() + timeout;

    // Test usage to be submitted by the client
    const start = now.getTime();
    const end = now.getTime();
    const usage = [
      {
        message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
        usage: {
          start: start,
          end: end,
          organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          measured_usage: [
            {
              measure: 'storage',
              quantity: 1073741824
            },
            {
              measure: 'light_api_calls',
              quantity: 1000
            },
            {
              measure: 'heavy_api_calls',
              quantity: 100
            }
          ]
        }
      },
      {
        message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
        usage: {
          start: start + 1,
          end: end + 1,
          organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          measured_usage: [
            {
              measure: 'storage',
              quantity: 1073741824
            },
            {
              measure: 'light_api_calls',
              quantity: 1000
            },
            {
              measure: 'heavy_api_calls',
              quantity: 100
            }
          ]
        }
      },
      {
        message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
        usage: {
          start: start + 2,
          end: end + 2,
          organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          measured_usage: [
            {
              measure: 'storage',
              quantity: 1073741824
            },
            {
              measure: 'light_api_calls',
              quantity: 1000
            },
            {
              measure: 'heavy_api_calls',
              quantity: 100
            }
          ]
        }
      }
    ];

    const expectedReport = require('./expectedReport.json');

    // Submit usage for sample resource with 10 GB, 1000 light API calls,
    // and 100 heavy API calls
    let posts = 0;
    const post = (u, done) => {
      console.log(u.message);

      const cb = () => {
        if (++posts === usage.length) done();
      };

      request.post(`${collector}/v1/metering/collected/usage`, { body: u.usage }, (err, val) => {
        expect(err).to.equal(undefined);

        // Expect a 202 with the location of the accumulated usage
        expect(val.statusCode).to.equal(202);
        expect(val.headers.location).to.not.equal(undefined);
        cb();
      });
    };

    // Print the number of usage docs already processed given a get report
    // response, determined from the aggregated usage quantity found in the
    // report for our test resource
    const processed = (val) => {
      try {
        return val.body.resources[0].plans[0].aggregated_usage[1].windows[4][0].quantity;
      } catch (e) {
        // The response doesn't contain a valid report
        return 0;
      }
    };

    // Get a usage report for the test organization
    const get = (done) => {
      request.get(
        `${reporting}/v1/metering/organizations/us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/aggregated/usage`,
        {},
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          console.log('Processed %d usage docs', processed(val));
          let actual;
          try {
            actual = clone(omit(val.body, 'id', 'processed', 'processed_id', 'start', 'end'), prune);
            actual.spaces[0].consumers[0].resources[0].plans[0].resource_instances[0] = omit(
              actual.spaces[0].consumers[0].resources[0].plans[0].resource_instances[0],
              't',
              'p'
            );
            expect(actual).to.deep.equal(expectedReport);
            console.log(
              '\n',
              util.inspect(val.body, {
                depth: 20
              }),
              '\n'
            );
            done();
          } catch (e) {
            // If the comparison fails we'll be called again to retry
            // after 250 msec, give up after the configured timeout as
            // if we're still not getting the expected report then
            // the processing of the submitted usage must have failed
            if (moment.now() >= processingDeadline) {
              console.log('All submitted usage still not processed\n');
              expect(actual).to.deep.equal(expectedReport);
            } else setTimeout(() => get(done), 250);
          }
        }
      );
    };

    // Wait for the expected usage report, get a report every 250 msec until
    // we get the expected values indicating that all submitted usage has
    // been processed
    const wait = (done) => {
      console.log('\nRetrieving usage report');
      setImmediate(() => get(done));
    };

    // Wait for usage reporter to start
    request.waitFor(`${reporting}/batch`, {}, startTimeout, (err, value) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      // Run the above steps
      map(usage, (u) => post(u, () => wait(done)));
    });
  });
});
