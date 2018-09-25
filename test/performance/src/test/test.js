'use strict';

// Simulate a service provider submitting usage for a resource, check the
// usage report for those submissions and measure the performance.

// Scenarios:
// - Concurrently submit a usage doc for a resource instance
// - Concurrently submit a usage doc for multiple resource instances
// - Concurrently submit a usage doc for multiple organizations
//
// TODO add resource and space variations
// TODO Use Hystrix metrics for internal performance measurements

const { clone, each, extend, omit, range, shuffle } = require('underscore');

const util = require('util');

const async = require('async');
const commander = require('commander');

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const request = require('abacus-request');
const retry = require('abacus-retry');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');

const brequest = retry(breaker(batch(request)), {
  retries: 20,
  min: 1000,
  max: Infinity
});
const usage = require('./usage.js');

// Setup the debug log
const debug = require('abacus-debug')('abacus-perf-test');
const xdebug = require('abacus-debug')('x-abacus-perf-test');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'perf');
commander
  .option('-o, --orgs <n>', 'number of organizations', parseInt)
  .option('-i, --instances <n>', 'number of resource instances', parseInt)
  .option('-u, --usagedocs <n>', 'number of usage docs', parseInt)
  .option('-d, --delta <d>', 'usage time window shift in milli-seconds', parseInt)
  .option('--no-timestamp', 'do not add timestamp to org names', false)
  .option('--num-executions <n>', 'number of test executions', 1)
  .option('-l, --limit <n>', 'max number of parallel submissions', parseInt)
  .option('--plan-type <type>', '"basic" or "standard"', 'basic')
  .option('-t, --start-timeout <n>', 'external processes start timeout in milliseconds', parseInt)
  .option('-p, --processing-timeout <n>', 'pipeline processing timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>', 'test timeout in milliseconds', parseInt)
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
  .allowUnknownOption(true)
  .parse(argv);

// Number of organizations
const orgs = commander.orgs || 1;

// Number of resource instances
const resourceInstances = commander.instances || 1;

// Number of usage docs
const usagedocs = commander.usagedocs || 1;

// Plan type
const planType = commander.planType;

// Usage time window shift in milli-seconds
const delta = commander.delta || 0;

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

const processingTimeout = commander.processingTimeout || 5000;

const numExecutions = commander.numExecutions;

const timestamp = commander.timestamp;

const limit = commander.limit;

// Collector service URL
const collector = commander.collector;

// Reporting service URL
const reporting = commander.reporting;

// Auth server URL
const authServer = commander.authServer;

// Use secure routes or not
const secured = () => process.env.SECURED === 'true';

const objectStorageToken = secured()
  ? oauth.cache(
    authServer,
    process.env.OBJECT_STORAGE_CLIENT_ID,
    process.env.OBJECT_STORAGE_CLIENT_SECRET,
    'abacus.usage.object-storage.write'
  )
  : undefined;

const systemToken = secured()
  ? oauth.cache(authServer, process.env.SYSTEM_CLIENT_ID, process.env.SYSTEM_CLIENT_SECRET, 'abacus.usage.read')
  : undefined;

describe('abacus-performance-test', () => {
  before((done) => {
    if (objectStorageToken)
      objectStorageToken.start((err) => {
        if (err) console.log('Could not fetch object storage token due to, %o', err);
      });

    if (systemToken)
      systemToken.start((err) => {
        if (err) console.log('Could not fetch system token due to, %o', err);
      });

    done();
  });

  it('measures performance of concurrent usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs or
    // a preset timeout
    console.log('Testing with %d orgs, %d resource instances, %d usage docs with limit %d and plan type %s',
      orgs, resourceInstances, usagedocs, limit, planType);
    const timeout = Math.max(totalTimeout, 100 * orgs * resourceInstances * usagedocs);
    this.timeout(timeout + 2000);
    const processingDeadline = moment.now() + timeout;

    console.log('Test timeout %d ms, processing timeout %d ms, num executions %d',
      timeout, processingTimeout, numExecutions);

    const authHeader = (token) =>
      token
        ? {
          headers: {
            authorization: token()
          }
        }
        : {};

    const post = (usageDoc, docNumber, cb) => {
      xdebug('Submitting org:%s instance:%s usage:%s ...',
        usageDoc.organization_id, usageDoc.resource_instance_id, docNumber + 1);
      brequest.post(`${collector}/v1/metering/collected/usage`,
        extend({}, authHeader(objectStorageToken), { body: usageDoc }),
        (err, response) => {
          const errorMessage = util.format('Response error: %j', err);
          expect(err).to.equal(undefined, errorMessage);

          const responseErrorMessage = util.format('Unexpected response code with headers: %j, body: %j',
            response.headers, response.body);
          expect(response.statusCode, responseErrorMessage).to.equal(202);

          debug('Submitted org:%s instance:%s usage:%s',
            usageDoc.organization_id, usageDoc.resource_instance_id, docNumber + 1);
          process.stdout.write('.');
          cb(err, response);
        }
      );
    };

    // Get a usage report for the test organization
    const get = (orgId, planType, done) => {
      brequest.get(`${reporting}/v1/metering/organizations/${orgId}/aggregated/usage`,
        extend({}, authHeader(systemToken)),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Compare the usage report we got with the expected report
          xdebug('Processed %d usage docs for org:%s', usage.processed(val), orgId);
          try {
            // Can't check the dynamic time in resource_instances
            val.body.spaces[0].consumers[0].resources[0].plans[0] = omit(
              val.body.spaces[0].consumers[0].resources[0].plans[0],
              'resource_instances'
            );
            const stippedResponse = usage.fixup(omit(val.body, 'id', 'processed', 'processed_id', 'start', 'end'));
            const expected = usage.fixup(
              usage.report(orgId, planType, resourceInstances, usagedocs, numExecutions)
            );
            expect(stippedResponse).to.deep.equal(expected);
            debug('Report for org:%s verified successfully', orgId);

            done();
          } catch (e) {
            xdebug('Failed obtaining report for org:%s, response: %s, %o', orgId, val ? val.statusCode : 'error', e);
            // If the comparison fails we'll be called again to retry
            // after 250 msec, but give up after the computed timeout
            if (moment.now() >= processingDeadline) {
              console.log(
                '\n',
                util.inspect(val.body, {
                  depth: 20
                }),
                '\n'
              );
              throw e;
            }

            done(e);
          }
        }
      );
    };

    const buildFunctions = () => {
      const postFunctions = [];
      const reportFunctions = [];
      each(range(orgs), (org) => {

        const orgId = usage.orgId(org, timestamp);
        reportFunctions.push((cb) => {
          async.retry({ times: Number.MAX_SAFE_INTEGER, interval: 1000 }, (done) => get(orgId, planType, done), cb);
        });

        each(range(usagedocs), (docNumber) =>
          each(range(resourceInstances), (resourceInstance) => {
            const usageDoc = usage.usageTemplate(orgId, resourceInstance, docNumber, planType, delta);
            postFunctions.push((cb) => post(usageDoc, docNumber, cb));
          }));
      });

      return {
        post: shuffle(postFunctions),
        report: reportFunctions
      };
    };

    // Post the requested number of usage docs
    const submit = (functions, done) => {
      const startTime = moment.now();
      const finishCb = (err) => {
        if (err)
          xdebug('Failed to submit docs with %o', err);
        else
          console.log('\nFinished submitting docs for %d ms', moment.now() - startTime);
        done(err);
      };

      process.stdout.write(util.format('Submitting %d usage docs ', orgs * resourceInstances * usagedocs));
      if (isNaN(limit))
        async.parallel(functions, finishCb);
      else
        async.parallelLimit(functions, limit, finishCb);
    };

    const waitForProcessing = (timeout, cb) => {
      console.log(`\nWaiting ${timeout} ms for processing to finish ...`);
      setTimeout(cb, timeout);
    };

    // Wait for the expected usage report for all organizations, get an organization usage report until
    // we get the expected values indicating that all submitted usage has been processed
    const getReports = (functions, done) => {
      console.log('\nRetrieving usage reports ...');
      if (isNaN(limit))
        async.parallel(functions, done);
      else
        async.parallelLimit(functions, 180, done);
    };

    // Wait for usage reporter to start
    request.waitFor(reporting + '/batch', extend({}, authHeader(systemToken)), startTimeout, (err) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      // Run the above steps
      const functions = buildFunctions();
      submit(functions.post, () => waitForProcessing(processingTimeout, () => getReports(functions.report, done)));
    });
  });
});
