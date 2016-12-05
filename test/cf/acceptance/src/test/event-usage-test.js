'use strict';

const commander = require('commander');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;

const request = require('abacus-request');

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-acceptance-test');
const responseDebug =
  require('abacus-debug')('abacus-cf-acceptance-test-response');
const resultDebug =
  require('abacus-debug')('abacus-cf-acceptance-test-result');

const timeWindows = {
  'second' : 0,
  'minute' : 1,
  'hour'   : 2,
  'day'    : 3,
  'month'  : 4
};

// Checks if the difference between start and end time fall within a window
const isWithinWindow = (start, end, timeWindow) => {
  // [Second, Minute, Hour, Day, Month]
  const timescale = [1, 100, 10000, 1000000, 100000000];
  // Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
  const dateUTCNumbify = (t) => {
    const d = new Date(t);
    return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
      + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
      + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
  };

  return Math.floor(dateUTCNumbify(end) / timescale[timeWindow]) -
    Math.floor(dateUTCNumbify(start) / timescale[timeWindow]) === 0;
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
const submitTime = Date.now();

describe('abacus-acceptance test', () => {
  let expectedConsuming;

  const checkAllTimeWindows = (usage, reporttime, level) => {
    for (const windowType in timeWindows)
      if(isWithinWindow(submitTime, reporttime, timeWindows[windowType])) {
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
          const reporttime = Date.now();

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkAllTimeWindows(planUsage, reporttime);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage, reporttime, 'resource');

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

  const poll = (fn, done, timeout = 1000, interval = 100) => {
    const startTimestamp = Date.now();

    const doneCallback = (err) => {
      if (!err) {
        debug('Expectation in %s met', fn.name);
        setImmediate(() => done());
        return;
      }

      if (Date.now() - startTimestamp > timeout) {
        debug('Expectation not met for %d ms. Error: %o', timeout, err);
        setImmediate(() => done(new Error(err)));
      }
      else
        setTimeout(() => {
          debug('Calling %s after >= %d ms...', fn.name, interval);
          fn(doneCallback);
        }, interval);
    };

    debug('Calling %s for the first time...', fn.name);
    fn(doneCallback);
  };

  const waitForStartAndPoll = (done) => {
    let startWaitTime = Date.now();
    request.waitFor('https://:reportingApp.:cfDomain/batch', {
      reportingApp: commander.reportingApp,
      cfDomain: commander.cfDomain
    },
      startTimeout, (err, uri, opts) => {
        // Failed to ping component before timing out
        if (err) throw err;

        poll(checkReport, (error) => {
          done(error);
        }, totalTimeout - (Date.now() - startWaitTime), 1000);
      }
    );
  };

  context('with stream of CF events', () => {
    beforeEach(() => {
      // 9 apps consuming 512 MB
      // one app using 1 GB
      // one app using 4 GB
      // total: 9.5 GB
      expectedConsuming = 9.5;
    });

    it('submits usage and gets expected report back', function(done) {
      if (!commander.organizationGuid)
        done(new Error('Organization GUID missing'));

      this.timeout(totalTimeout + 2000);
      waitForStartAndPoll(done);
    });
  });
});
