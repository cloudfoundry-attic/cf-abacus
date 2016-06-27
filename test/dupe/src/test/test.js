'use strict';

// Simulate a test service provider that submits duplicate usage for a
// resource and verifies the submission by retrieving a usage report.

const _ = require('underscore');
const extend = _.extend;
const map = _.map;
const omit = _.omit;

const request = require('abacus-request');
const commander = require('commander');
const clone = require('abacus-clone');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'dupe');
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
  .option('-u, --usage-time <n>',
    'submitted usage time', parseInt)
  .option('-d, --delay <n>',
    'delay between submissions', parseInt)
  .option('-n, --num <n>',
    'number of submissions', parseInt)
  .option('-o, --organization-guid <o>',
    'organization guid to submit duplicate usage for')
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
const startTimeout = commander.startTimeout || 30000;

// Submitted usage time
const usageTime = commander.usageTime || Date.now();

// Delay in milliseconds between each submission
const delay = commander.delay || 20000;

// Total number of submissions to attempt
const num = commander.num || 7;

// Test organization guid
const organization = commander.organizationGuid || 'test-org';

// This test timeout
const totalTimeout = 60000 + delay * num;

// Use secure routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Token fetcher
const token = secured() ? oauth.cache(authServer,
  process.env.CLIENT_ID, process.env.CLIENT_SECRET,
  'abacus.usage.object-storage.write abacus.usage.object-storage.read') :
  undefined;

const authHeader = (token) => token ? {
  headers: {
    authorization: token()
  }
} : {};

const prune = (v, k) => {
  if(k === 'windows')
    map(v, (w) => {
      map(w, (tw) => {
        if(tw) {
          if(tw.charge)
            tw.charge = 0;
          if(tw.summary)
            tw.summary = 0;
        }
      });
    });
  return v;
};

describe('abacus-dupe', function() {
  const timeout = Math.max(totalTimeout, 40000);
  this.timeout(timeout);
  before((done) => {
    if (token)
      token.start();

    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-/, done);
  });

  it('submits usage for a sample resource and retrieves an aggregated ' +
    'usage report', (done) => {

    // Configure the test timeout
    this.timeout(timeout);

    // Test usage to be submitted by the client
    const start = usageTime;
    const end = usageTime;

    const usage = {
      start: start,
      end: end,
      organization_id: organization,
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
    };

    // Submit usage for sample resource with 10 GB, 1000 light API calls,
    // and 100 heavy API calls
    let posts = 0;
    let previousReport;
    const post = (u, done) => {
      console.log('Posting document', posts + 1);

      const cb = () => {
        posts++;
        done();
      };

      request.post(collector + '/v1/metering/collected/usage',
        extend({ body: u }, authHeader(token)), (err, val) => {
          if(organization === 'test_status_code_502') {
            expect(err).to.not.equal(undefined);
            expect(val).to.equal(undefined);
          }
          else {
            expect(err).to.equal(undefined);
            if(organization !== 'test_status_code_404') {
              expect(val.statusCode).to.equal(201);
              expect(val.headers.location).to.not.equal(undefined);
            }
            else
              expect(val.statusCode).to.equal(404);
          }
          // Expect a 201 with the location of the accumulated usage
          cb();
        });
    };

    // Get a usage report for the test organization
    const get = (u, done) => {
      console.log('Retrieving Usage Report');
      request.get([
        reporting,
        'v1/metering/organizations',
        organization,
        'aggregated/usage'
      ].join('/'), extend({}, authHeader(token)), (err, val) => {
        if(organization === 'test_status_code_502')
          expect(err).to.not.equal(undefined);
        else if(organization === 'test_status_code_404') {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(404);
        }
        else {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Only check the previous report if it exists
          if(!previousReport) {
            console.log('Setting report');
            previousReport = clone(omit(val.body,
              'id', 'processed', 'processed_id', 'start', 'end'), prune);
          }
          else {
            expect(previousReport).to.deep.equal(clone(omit(val.body,
              'id', 'processed', 'processed_id', 'start', 'end'), prune));
            console.log('No change in report');
          }
        }

        // Exit if all submissions are done, otherwise wait and post again
        if(posts === num) {
          console.log('No duplicates aggregated. Ending test.');
          done();
        }
        else {
          console.log('Waiting', delay, ' milliseconds before submitting');
          setTimeout(() => post(u, () => get(u, done)), delay);
        }
      });
    };

    // Wait for usage reporter to start
    request.waitFor(reporting + '/batch', {}, startTimeout, (err, value) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      // Run the above steps
      post(usage, () => get(usage, done));
    });
  });
});
