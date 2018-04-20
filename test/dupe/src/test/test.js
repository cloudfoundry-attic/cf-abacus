'use strict';

// Simulate a test service provider that submits duplicate usage for a
// resource and verifies the submission by retrieving a usage report.

const _ = require('underscore');
const extend = _.extend;
const filter = _.filter;
const each = _.each;

const request = require('abacus-request');
const commander = require('commander');
const clone = require('abacus-clone');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'dupe');
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
  .option(
    '-a, --auth-server <uri>',
    'authentication server URL or domain name [http://localhost:9882]',
    'http://localhost:9882'
  )
  .option('-t, --start-timeout <n>', 'external processes start timeout in milliseconds', parseInt)
  .option('-u, --usage-time <n>', 'submitted usage time', parseInt)
  .option('-d, --delay <n>', 'delay between submissions', parseInt)
  .option('-n, --num <n>', 'number of submissions', parseInt)
  .option('-o, --organization-guid <o>', 'organization guid to submit duplicate usage for')
  .option('-s, --synthetic', 'synthetic tests (require example account-plugin and big delay)')
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

// Auth server URL
const authServer = /:/.test(commander.authServer)
  ? commander.authServer
  : 'https://abacus-authserver-plugin.' + commander.authServer;

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 30000;

// Submitted usage time
const usageTime = commander.usageTime || moment.now();

// Delay in milliseconds between each submission
const delay = commander.delay || 20000;

// Total number of submissions to attempt
const num = commander.num || 7;

// Test organization guid
const organization = commander.organizationGuid || 'test-org';

// This test timeout
const totalTimeout = Math.max(60000 + delay * num, 65000);

// Use secure routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Token fetchers
const objectStorageToken = secured()
  ? oauth.cache(
    authServer,
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    'abacus.usage.object-storage.write abacus.usage.object-storage.read'
  )
  : undefined;
const systemToken = secured()
  ? oauth.cache(authServer, process.env.CLIENT_ID, process.env.CLIENT_SECRET, 'abacus.usage.read')
  : undefined;

const authHeader = (token) =>
  token
    ? {
      headers: {
        authorization: token()
      }
    }
    : {};

// Test usage to be submitted by the client
const buildUsage = (orgGuid) => ({
  start: usageTime,
  end: usageTime,
  organization_id: orgGuid,
  space_id: 'test-space',
  consumer_id: 'test-consumer',
  resource_id: 'test-resource',
  plan_id: 'basic',
  resource_instance_id: 'test-instance',
  measured_usage: [
    {
      measure: 'previous_instance_memory',
      quantity: 536870912
    },
    {
      measure: 'previous_running_instances',
      quantity: 0
    },
    {
      measure: 'current_instance_memory',
      quantity: 536870912
    },
    {
      measure: 'current_running_instances',
      quantity: 1
    }
  ]
});

describe('abacus-dupe', function() {
  // Configure the test timeout
  this.timeout(totalTimeout);

  before((done) => {
    if (objectStorageToken)
      objectStorageToken.start();

    if (systemToken)
      systemToken.start();

    // drop all abacus collections except plans and plan-mappings
    dbclient.drop(process.env.DB, /^abacus-((?!plan).)*$/, () => {
      // Wait for usage reporter to start
      request.waitFor(reporting + '/batch', {}, startTimeout, (err) => {
        // Failed to ping usage reporter before timing out
        if (err)
          throw err;

        done();
      });
    });
  });

  context('with organization ' + organization, () => {

    it('submits duplicated usage for a sample resource and retrieves ' + 'an aggregated usage report', (done) => {

      let posts = 1;

      const validateAggregatedUsage = (aggregatedUsage, metric) => {
        const memoryAggregation = filter(aggregatedUsage, (aggregation) => {
          return aggregation.metric === metric ? aggregation : undefined;
        });

        const windows = memoryAggregation[0].windows;
        each(windows, (window) => {
          each(window, (element) => {
            if (element !== null) {
              expect(element.quantity.consuming).to.equal(0.5);
              expect(element.cost.consuming).to.equal(0.5);
            }
          });
        });
      };

      const get = (done) => {
        console.log('Retrieving Usage Report');

        request.get([reporting, 'v1/metering/organizations', organization, 'aggregated/usage'].join('/'),
          extend({}, authHeader(systemToken)),
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            const report = val.body;
            expect(report.resources.length).to.equal(1);
            expect(report.resources[0].plans.length).to.equal(1);
            const resourceAggregatedUsage = report.resources[0].plans[0].aggregated_usage;
            validateAggregatedUsage(resourceAggregatedUsage, 'memory');

            expect(report.spaces[0].resources.length).to.equal(1);
            expect(report.spaces[0].resources[0].plans.length).to.equal(1);
            const spaceAggregatedUsage = val.body.spaces[0].resources[0].plans[0].aggregated_usage;
            validateAggregatedUsage(spaceAggregatedUsage, 'memory');

            done();
          }
        );
      };

      const post = (u, done) => {
        console.log('\nPosting document', posts);

        request.post(collector + '/v1/metering/collected/usage',
          extend({ body: u }, authHeader(objectStorageToken)),
          (err, val) => {
            if (posts === 1) {
              // Expect a 201 with the location of the accumulated usage
              console.log('No document Conflict');
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(201);
              expect(val.headers.location).to.not.equal(undefined);
            } else {
              // Expect 409 conflict without location
              console.log('Document Conflict');
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(409);
              expect(val.headers.location).to.equal(undefined);
            }

            if (posts++ === num) {
              console.log('No duplicates aggregated. Ending test.');
              get(done);
            } else {
              console.log('Waiting', delay, 'milliseconds before submitting');
              setTimeout(() => post(u, done), delay);
            }
          }
        );
      };

      // Run the above steps
      console.log('Will attempt %d submissions in organization %s', num, organization);
      const usage = buildUsage(organization);
      post(usage, done);
    });
  });

  const synthetic = commander.synthetic ? context : context.skip;

  synthetic('with organization test_status_code_502', () => {
    it(
      'submits duplicated usage in organization causing 502 ' + 'and retrieves unchanged aggregated usage report',
      (done) => {
        // Submit usage for sample resource with 10 GB, 1000 light API calls,
        // and 100 heavy API calls
        let posts = 0;
        const post = (u, done) => {
          console.log('\nPosting document', posts + 1);

          request.post(
            collector + '/v1/metering/collected/usage',
            extend({ body: u }, authHeader(objectStorageToken)),
            (err, val) => {
              // Expect 502 from account plugin
              expect(err).to.not.equal(undefined);
              expect(val).to.equal(undefined);
              posts++;
              done();
            }
          );
        };

        // Get a usage report for the test organization
        const get = (u, done) => {
          console.log('Retrieving Usage Report');
          request.get(
            [reporting, 'v1/metering/organizations/test_status_code_502', 'aggregated/usage'].join('/'),
            extend({}, authHeader(systemToken)),
            (err, val) => {
              expect(err).to.not.equal(undefined);

              // Exit if all submissions are done, otherwise wait and post again
              if (posts === num) {
                console.log('No duplicates aggregated. Ending test.');
                done();
              } else {
                console.log('Waiting', delay, 'milliseconds before submitting');
                setTimeout(() => post(u, () => get(u, done)), delay);
              }
            }
          );
        };

        // Run the above steps
        console.log('Will attempt %d submissions in organization ' + 'test_status_code_502', num);
        const usage = buildUsage('test_status_code_502');
        post(usage, () => get(usage, done));
      }
    );
  });

  synthetic('with organization test_status_code_404', () => {
    it(
      'submits duplicated usage in missing organization ' + 'and retrieves unchanged aggregated usage report',
      (done) => {
        // Submit usage for sample resource with 10 GB, 1000 light API calls,
        // and 100 heavy API calls
        let posts = 0;
        const post = (u, done) => {
          console.log('\nPosting document', posts + 1);

          request.post(
            collector + '/v1/metering/collected/usage',
            extend({ body: u }, authHeader(objectStorageToken)),
            (err, val) => {
              // Expect 422 and error from collector
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(422);
              expect(val.body.error).to.equal('eorgnotfound');
              posts++;
              done();
            }
          );
        };

        // Get a usage report for the test organization
        const get = (u, done) => {
          console.log('Retrieving Usage Report');
          request.get(
            [reporting, 'v1/metering/organizations/test_status_code_404', 'aggregated/usage'].join('/'),
            extend({}, authHeader(systemToken)),
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(404);

              // Exit if all submissions are done, otherwise wait and post again
              if (posts === num) {
                console.log('No duplicates aggregated. Ending test.');
                done();
              } else {
                console.log('Waiting', delay, 'milliseconds before submitting');
                setTimeout(() => post(u, () => get(u, done)), delay);
              }
            }
          );
        };

        // Run the above steps
        console.log('Will attempt %d submissions in organization ' + 'test_status_code_404', num);
        const usage = buildUsage('test_status_code_404');
        post(usage, () => get(usage, done));
      }
    );
  });
});
