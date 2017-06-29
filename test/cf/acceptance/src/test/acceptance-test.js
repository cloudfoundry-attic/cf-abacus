'use strict';

const commander = require('commander');
const util = require('util');
const moment = require('abacus-moment');

const _ = require('underscore');
const clone = _.clone;

const client = require('abacus-client');
const request = require('abacus-request');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-acceptance-test');
const responseDebug =
  require('abacus-debug')('abacus-cf-acceptance-test-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-acceptance-test-result');

const timeWindows = {
  'hour'   : 2,
  'day'    : 3,
  'month'  : 4
};

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'acceptance');
commander
  .option('-r, --reporting-app <reporting-app>',
    'abacus reporting app name', process.env.REPORTING_APP)
  .option('-d, --cf-domain <cf-domain>',
    'cf domain', process.env.CF_DOMAIN)
  .option('-o, --organization-guid <guid>',
    'abacus organization guid', process.env.ORG_GUID)
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 100000;

// This test timeout
const totalTimeout = commander.totalTimeout || 200000;

describe('abacus-acceptance test', () => {
  let expectedConsuming;

  const checkAllTimeWindows = (usage, level) => {
    for (const windowType in timeWindows) {
      const windowUsage = usage.windows[timeWindows[windowType]];
      if(level !== 'resource')
        expect(windowUsage[0].quantity.consuming).to.equal(expectedConsuming);
      expect(windowUsage[0].charge).to.be.above(0);
    }
  };

  const checkReport = (cb) => {
    request.get('https://:reportingApp.:cfDomain/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: commander.organizationGuid,
        reportingApp: commander.reportingApp,
        cfDomain: commander.cfDomain
      },
      (error, response) => {
        try {
          expect(error).to.equal(undefined);

          expect(response.body).to.contain.all.keys('resources', 'spaces');
          const resources = response.body.resources;
          expect(resources.length).to.equal(1);
          expect(response.body.spaces.length).to.equal(1);

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkAllTimeWindows(planUsage);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage, 'resource');

          resultDebug('All usage report checks are successful for: %s',
            JSON.stringify(response.body, null, 2));

          cb();
        }
        catch (e) {
          const message = util.format('Check failed with %s.\n' +
            'Usage report:\n', e.stack,
            response ? JSON.stringify(response.body, null, 2) : undefined);
          responseDebug(message);
          cb(new Error(message), e);
        }
      });
  };

  const waitForStartAndPoll = (done) => {
    let startWaitTime = moment.now();
    request.waitFor('https://:reportingApp.:cfDomain/batch', {
      reportingApp: commander.reportingApp,
      cfDomain: commander.cfDomain
    }, startTimeout, (err, uri, opts) => {
      // Failed to ping component before timing out
      if (err) throw err;

      debug('Starting to poll for report');
      client.poll(checkReport, {
        totalTimeout: totalTimeout - (moment.now() - startWaitTime)
      }, (error) => {
        done(error);
      });
    });
  };

  context('with stream of CF events', () => {
    beforeEach(() => {
      // 10 apps consuming 512 MB
      // pouchserver using 1 GB
      // total: 6 GB
      expectedConsuming = 6;
    });

    it('get expected report back', function(done) {
      if (!commander.organizationGuid)
        done(new Error('Organization GUID missing'));

      this.timeout(totalTimeout + 2000);
      waitForStartAndPoll(done);
    });
  });
});
