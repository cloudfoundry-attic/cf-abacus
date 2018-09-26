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

const { each, extend, omit, range, shuffle } = require('underscore');

const util = require('util');

const async = require('async');

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
const debug = require('abacus-debug')('abacus-performance-test');
const xdebug = require('abacus-debug')('x-abacus-performance-test');

const env = {
  orgs: process.env.ORGS || 1,
  resourceInstances: process.env.INSTANCES || 1,
  usagedocs: process.env.USAGE_DOCS || 1,
  planType: process.env.PLAN_TYPE || 'basic',
  delta: process.env.DELTA || 0,
  startTimeout: process.env.PERFORMANCE_START_TIMEOUT || 10000,
  totalTimeout: process.env.PERFORMANCE_TOTAL_TIMEOUT || 60000,
  processingTimeout: process.env.PROCESSING_TIMEOUT || 5000,
  numExecutions: process.env.NUMBER_EXECUTIONS || 1,
  timestamp: !(process.env.NO_TIMESTAMP === 'true'),
  limit: process.env.LIMIT,
  collector: process.env.COLLECTOR_URL || 'http://localhost:9080',
  reporting: process.env.REPORTING_URL || 'http://localhost:9088',
  authServer: process.env.AUTH_SERVER || 'http://localhost:9882',
  secured: process.env.SECURED === 'true',
  objectStorageClientId: process.env.OBJECT_STORAGE_CLIENT_ID,
  objectStorageClientSecret: process.env.OBJECT_STORAGE_CLIENT_SECRET,
  systemClientId: process.env.SYSTEM_CLIENT_ID,
  systemClientSecret: process.env.SYSTEM_CLIENT_SECRET
};

const objectStorageToken = env.secured
  ? oauth.cache(
    env.authServer, env.objectStorageClientId, env.objectStorageClientSecret, 'abacus.usage.object-storage.write')
  : undefined;

const systemToken = env.secured
  ? oauth.cache(env.authServer, env.systemClientId, env.systemClientSecret, 'abacus.usage.read')
  : undefined;

describe('abacus-perf-test', () => {
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
      env.orgs, env.resourceInstances, env.usagedocs, env.limit, env.planType);
    const timeout = Math.max(env.totalTimeout, 100 * env.orgs * env.resourceInstances * env.usagedocs);
    this.timeout(timeout + 2000);
    const processingDeadline = moment.now() + timeout;

    console.log('Test timeout %d ms, processing timeout %d ms, num executions %d',
      timeout, env.processingTimeout, env.numExecutions);

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
      brequest.post(`${env.collector}/v1/metering/collected/usage`,
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
      brequest.get(`${env.reporting}/v1/metering/organizations/${orgId}/aggregated/usage`,
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
              usage.report(orgId, planType, env.resourceInstances, env.usagedocs, env.numExecutions)
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
      each(range(env.orgs), (org) => {
        const orgId = usage.orgId(org, env.timestamp);
        reportFunctions.push((cb) => {
          async.retry({ times: Number.MAX_SAFE_INTEGER, interval: 1000 }, (done) => get(orgId, env.planType, done), cb);
        });

        each(range(env.usagedocs), (docNumber) =>
          each(range(env.resourceInstances), (resourceInstance) => {
            const usageDoc = usage.usageTemplate(orgId, resourceInstance, docNumber, env.planType, env.delta);
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

      process.stdout.write(util.format('Submitting %d usage docs ', env.orgs * env.resourceInstances * env.usagedocs));
      if (isNaN(env.limit))
        async.parallel(functions, finishCb);
      else
        async.parallelLimit(functions, env.limit, finishCb);
    };

    const waitForProcessing = (timeout, cb) => {
      console.log(`\nWaiting ${timeout} ms for processing to finish ...`);
      setTimeout(cb, timeout);
    };

    // Wait for the expected usage report for all organizations, get an organization usage report until
    // we get the expected values indicating that all submitted usage has been processed
    const getReports = (functions, done) => {
      console.log('\nRetrieving usage reports ...');
      if (isNaN(env.limit))
        async.parallel(functions, done);
      else
        async.parallelLimit(functions, 180, done);
    };

    // Wait for usage reporter to start
    request.waitFor(env.reporting + '/batch', extend({}, authHeader(systemToken)), env.startTimeout, (err) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      // Run the above steps
      const functions = buildFunctions();
      submit(functions.post, () => waitForProcessing(env.processingTimeout, () => getReports(functions.report, done)));
    });
  });
});
