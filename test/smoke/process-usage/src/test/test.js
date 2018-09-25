'use strict';

// Simulate a test service provider that submits usage for a resource and
// verifies the submission by retrieving a usage report.

const _ = require('underscore');
const { extend, map, omit } = require('underscore');

const clone = require('abacus-clone');
const oauth = require('abacus-oauth');
const moment = require('abacus-moment');
const request = require('abacus-request');
const timewindow = require('abacus-timewindow');
const util = require('util');


const env = {
  collectorUrl: process.env.COLLECTOR_URL || 'http://localhost:9080',
  reportingUrl: process.env.REPORTING_URL || 'http://localhost:9088',
  authServer: process.env.AUTH_SERVER || 'http://localhost:9882',
  startTimeout: process.env.SMOKE_START_TIMEOUT || 10000,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 60000,
  systemClientId: process.env.SYSTEM_CLIENT_ID,
  systemClientSecret: process.env.SYSTEM_CLIENT_SECRET,
  secured: process.env.SECURED === 'true',
  objectStorageClientId: process.env.OBJECT_STORAGE_CLIENT_ID,
  objectStorageClientSecret: process.env.OBJECT_STORAGE_CLIENT_SECRET,
  slack: process.env.SLACK,
  windowsSizes: process.env.TIME_WINDOWS_SIZES ? JSON.parse(process.env.TIME_WINDOWS_SIZES) : undefined
};

// The current time
const now = moment.utc().toDate();

// Token fetchers
const objectStorageToken = env.secured ?
  oauth.cache(env.authServer, env.objectStorageClientId, env.objectStorageClientSecret,
    'abacus.usage.object-storage.write')
  : undefined;
const systemToken = env.secured
  ? oauth.cache(env.authServer, env.systemClientId, env.systemClientSecret, 'abacus.usage.read')
  : undefined;

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () =>
  /^[0-9]+[MDhms]$/.test(env.slack)
    ? {
      scale: env.slack.charAt(env.slack.length - 1),
      width: env.slack.match(/[0-9]+/)[0]
    }
    : {
      scale: timewindow.dimension.min,
      width: 10
    };

const initWindows = (win, dimension) => {
  const windows = [win];

  if(env.windowsSizes && env.windowsSizes[dimension])
    _(env.windowsSizes[dimension] - 1).times(() => windows.push(null));

  else {
    const timeWindows = timewindow.timeWindowsSizes(slack(), env.windowsSizes);
    _(timeWindows.getWindows(dimension).length - 1).times(() => windows.push(null));
  }

  return windows;
};

const buildExpectedWindows = (summary, quantity) => {

  const addProperty = (key, value, obj) => {
    if (value !== undefined)
      obj[key] = value;
  };

  const win = {};
  addProperty('summary', summary, win);
  addProperty('quantity', quantity, win);

  return [
    [null],
    [null],
    [null],
    initWindows(win, timewindow.dimension.day),
    initWindows(win, timewindow.dimension.month)
  ];
};

// Compares the previous and expected window values based upon the
// summary, quantity and window delta
const deltaCompare = (currentWindow, previousWindow, s, q) => {
  expect(currentWindow).to.not.equal(undefined, 'Missing current window');
  expect(previousWindow).to.not.equal(undefined, 'Missing previous window');

  const checkIfNear = (key, increment, current, previous) => {
    if (
      typeof increment !== 'undefined' &&
      typeof current[key] !== 'undefined' &&
      typeof previous[key] !== 'undefined'
    ) {
      const currentValue = current[key];
      const previousValue = previous[key];
      let message = util.format('No change in %s=%d detected', key, previousValue);
      expect(currentValue).to.not.equal(previousValue, message);

      const diff = currentValue - previousValue - increment;
      message = util.format(
        '%s=%d, expected increase %d from %d, ∆=%d',
        key,
        currentValue,
        increment,
        previousValue,
        diff
      );
      expect(Math.abs(diff)).to.be.below(0.01, message);
    }
  };
  checkIfNear('summary', s, currentWindow, previousWindow);
  checkIfNear('quantity', q, currentWindow, previousWindow);
};

const authHeader = (token) =>
  token
    ? {
      headers: {
        authorization: token()
      }
    }
    : {};

describe('process usage smoke test', function() {
  before((done) => {
    if(!secured()) {
      done();
      return;
    }

    objectStorageToken.start((err) => {
      if (err) {
        done(err);
        return;
      }

      systemToken.start((err) => {
        done(err);
        return;
      });
    });
  });

  it('submits usage for a sample resource and retrieves an aggregated usage report', function(done) {
    // Configure the test timeout
    const timeout = Math.max(env.totalTimeout, 40000);
    const processingDeadline = moment.now() + timeout;
    this.timeout(timeout + 2000);
    console.log('Test will run until %s', moment.utc(processingDeadline).toDate());

    // Test usage to be submitted by the client
    const buildUsage = (time) => ({
      message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
      usage: {
        start: time,
        end: time,
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
    });

    const usage = [];
    _(3).times((n) => {
      usage.push(buildUsage(now.getTime() + n));
    });

    // Initial expected usage report for the test organization
    const initialExpectedReport = {
      organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      account_id: '1234',
      resources: [
        {
          resource_id: 'object-storage',
          aggregated_usage: [
            {
              metric: 'storage',
              windows: buildExpectedWindows(1, 1)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: buildExpectedWindows(3, 3)
            },
            {
              metric: 'heavy_api_calls',
              windows: buildExpectedWindows(300, 300)
            }
          ],
          plans: [
            {
              plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: buildExpectedWindows(1, 1)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: buildExpectedWindows(3, 3)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: buildExpectedWindows(300, 300)
                }
              ]
            }
          ]
        }
      ],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [
            {
              resource_id: 'object-storage',
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: buildExpectedWindows(1, 1)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: buildExpectedWindows(3, 3)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: buildExpectedWindows(300, 300)
                }
              ],
              plans: [
                {
                  plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
                  metering_plan_id: 'basic-object-storage',
                  rating_plan_id: 'object-rating-plan',
                  pricing_plan_id: 'object-pricing-basic',
                  aggregated_usage: [
                    {
                      metric: 'storage',
                      windows: buildExpectedWindows(1, 1)
                    },
                    {
                      metric: 'thousand_light_api_calls',
                      windows: buildExpectedWindows(3, 3)
                    },
                    {
                      metric: 'heavy_api_calls',
                      windows: buildExpectedWindows(300, 300)
                    }
                  ]
                }
              ]
            }
          ],
          consumers: [
            {
              consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
              resources: [
                {
                  resource_id: 'object-storage',
                  aggregated_usage: [
                    {
                      metric: 'storage',
                      windows: buildExpectedWindows(1, 1)
                    },
                    {
                      metric: 'thousand_light_api_calls',
                      windows: buildExpectedWindows(3, 3)
                    },
                    {
                      metric: 'heavy_api_calls',
                      windows: buildExpectedWindows(300, 300)
                    }
                  ],
                  plans: [
                    {
                      plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
                      metering_plan_id: 'basic-object-storage',
                      rating_plan_id: 'object-rating-plan',
                      pricing_plan_id: 'object-pricing-basic',
                      resource_instances: [
                        {
                          id: '0b39fa70-a65f-4183-bae8-385633ca5c87'
                        }
                      ],
                      aggregated_usage: [
                        {
                          metric: 'storage',
                          windows: buildExpectedWindows(1, 1)
                        },
                        {
                          metric: 'thousand_light_api_calls',
                          windows: buildExpectedWindows(3, 3)
                        },
                        {
                          metric: 'heavy_api_calls',
                          windows: buildExpectedWindows(300, 300)
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    // Submit usage for sample resource with 10 GB, 1000 light API calls,
    // and 100 heavy API calls
    let posts = 0;
    const post = (u, done) => {
      console.log('%s: %s', u.usage.start, u.message);

      const cb = () => {
        if (++posts === usage.length) done();
      };

      request.post(
        `${env.collectorUrl}/v1/metering/collected/usage`,
        extend({ body: u.usage }, authHeader(objectStorageToken)),
        (err, val) => {
          expect(err).to.equal(undefined, util.format('Error: %o', err));

          // Expect a 202 with the location of the accumulated usage
          expect(val.statusCode).to.equal(
            202,
            util.format('Response code: %d; headers: %j; body: %j', val.statusCode, val.headers, val.body)
          );
          expect(val.headers.location).to.not.equal(undefined);
          cb();
        }
      );
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

    const deltaCompareReports = (updatedReport, previousReport) => {
      deltaCompare(
        updatedReport.resources[0].plans[0].aggregated_usage[1].windows,
        previousReport.resources[0].plans[0].aggregated_usage[1].windows,
        3,
        3
      );
      deltaCompare(
        updatedReport.resources[0].plans[0].aggregated_usage[2].windows,
        previousReport.resources[0].plans[0].aggregated_usage[2].windows,
        300,
        300
      );

      deltaCompare(
        updatedReport.spaces[0].resources[0].plans[0].aggregated_usage[1].windows,
        previousReport.spaces[0].resources[0].plans[0].aggregated_usage[1].windows,
        3,
        3
      );
      deltaCompare(
        updatedReport.spaces[0].resources[0].plans[0].aggregated_usage[2].windows,
        previousReport.spaces[0].resources[0].plans[0].aggregated_usage[2].windows,
        300,
        300
      );

      deltaCompare(
        updatedReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[1].windows,
        previousReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[1].windows,
        3,
        3
      );
      deltaCompare(
        updatedReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[2].windows,
        previousReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[2].windows,
        300,
        300
      );
    };

    // Get a usage report for the test organization
    const getReport = (cb) => {
      request.get(
        [
          env.reportingUrl,
          'v1/metering/organizations',
          'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          'aggregated/usage'
        ].join('/'),
        extend({}, authHeader(systemToken)),
        (err, val) => {
          expect(err).to.equal(undefined, util.format('Error: %o', err));
          expect(val.statusCode).to.equal(
            200,
            util.format('Response code: %d; headers: %j; body: %j', val.statusCode, val.headers, val.body)
          );

          const actual = clone(omit(val.body, 'id', 'processed', 'processed_id', 'start', 'end'));

          cb(actual, processed(val));
        }
      );
    };

    // Compare the usage report we got with the expected report
    const compareReport = (previousReport, processedDocs, done) => {
      getReport((updatedReport) => {
        try {
          updatedReport.spaces[0].consumers[0].resources[0].plans[0].resource_instances[0] = omit(
            updatedReport.spaces[0].consumers[0].resources[0].plans[0].resource_instances[0],
            't',
            'p'
          );

          if (processedDocs !== 0) deltaCompareReports(updatedReport, previousReport);
          else expect(updatedReport).to.deep.equal(initialExpectedReport);
          console.log(
            '\nUpdated report:\n',
            util.inspect(updatedReport, {
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
            console.log('%s: All submitted usage still not processed\n', moment.utc().toDate());
            if (processedDocs !== 0) deltaCompareReports(updatedReport, previousReport);
            else expect(updatedReport).to.deep.equal(initialExpectedReport);
          } else setTimeout(() => compareReport(previousReport, processedDocs, done), 250);
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
    request.waitFor(env.reportingUrl + '/batch', {}, env.startTimeout, (err) => {
      // Failed to ping usage reporter before timing out
      if (err) throw err;

      console.log('\n%s: Retrieving current report', moment.utc().toDate());
      getReport((report, processed) => {
        console.log(
          '\n%s: Report after %d processed usage docs:\n%s\n',
          moment.utc().toDate(),
          processed,
          util.inspect(report, { depth: 20 })
        );

        // Post usage and wait for report
        map(usage, (u) => post(u, () => wait(report, processed, done)));
      });
    });
  });
});
