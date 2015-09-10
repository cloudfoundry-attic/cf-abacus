'use strict';

// Simulate a test service provider that submits usage for a resource and
// verifies the submission by retrieving a usage report.

const _ = require('underscore');

const request = require('abacus-request');
const util = require('util');
const commander = require('commander');

const map = _.map;
const omit = _.omit;
const clone = _.clone;

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
  .option(
    '-d, --delta <d>', 'usage time window shift in milli-seconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// Collector service URL
const collector = /:/.test(commander.collector) ? commander.collector :
  'https://abacus-usage-collector.' + commander.collector;

// Reporting service URL
const reporting = /:/.test(commander.reporting) ? commander.reporting :
  'https://abacus-usage-reporting.' + commander.reporting;

// Usage time window shift in milli-seconds
const delta = commander.delta || 0;

describe('abacus-demo-client', () => {
  it('submits usage for a sample resource and retrieves an aggregated ' +
    'usage report', function(done) {
      // Configure the test timeout
      const timeout = 20000;
      this.timeout(timeout + 2000);

      // Test usage to be submitted by the client
      const start = 1435629365220 + delta;
      const end = 1435629465220 + delta;
      const usage = [
        {
          message:
            'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
          usage: {
            usage: [{
              start: start,
              end: end,
              region: 'us',
              organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              consumer: {
                type: 'EXTERNAL',
                consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
              },
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
            }]
          }
        },
        {
          message:
            'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
          usage: {
            usage: [{
              start: start + 1,
              end: end + 1,
              region: 'us',
              organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              consumer: {
                type: 'EXTERNAL',
                consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
              },
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
            }]
          }
        },
        {
          message:
            'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
          usage: {
            usage: [{
              start: start + 2,
              end: end + 2,
              region: 'us',
              organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              consumer: {
                type: 'EXTERNAL',
                consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
              },
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
            }]
          }
        }];

      // Expected usage report for the test organization
      const report = {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        charge: 46.09,
        resources: [{
          resource_id: 'object-storage',
          charge: 46.09,
          aggregated_usage: [{
            metric: 'storage',
            quantity: 1,
            summary: 1,
            charge: 1
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 3,
            summary: 3,
            charge: 0.09
          }, {
            metric: 'heavy_api_calls',
            quantity: 300,
            summary: 300,
            charge: 45
          }],
          plans: [{
            plan_id: 'basic',
            charge: 46.09,
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1,
              summary: 1,
              cost: 1,
              charge: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 3,
              summary: 3,
              cost: 0.09,
              charge: 0.09
            }, {
              metric: 'heavy_api_calls',
              quantity: 300,
              summary: 300,
              cost: 45,
              charge: 45
            }]
          }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          charge: 46.09,
          resources: [{
            resource_id: 'object-storage',
            charge: 46.09,
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1,
              summary: 1,
              charge: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 3,
              summary: 3,
              charge: 0.09
            }, {
              metric: 'heavy_api_calls',
              quantity: 300,
              summary: 300,
              charge: 45
            }],
            plans: [{
              plan_id: 'basic',
              charge: 46.09,
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1,
                summary: 1,
                cost: 1,
                charge: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 3,
                summary: 3,
                cost: 0.09,
                charge: 0.09
              }, {
                metric: 'heavy_api_calls',
                quantity: 300,
                summary: 300,
                cost: 45,
                charge: 45
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            charge: 46.09,
            resources: [{
              resource_id: 'object-storage',
              charge: 46.09,
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1,
                summary: 1,
                charge: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 3,
                summary: 3,
                charge: 0.09
              }, {
                metric: 'heavy_api_calls',
                quantity: 300,
                summary: 300,
                charge: 45
              }],
              plans: [{
                plan_id: 'basic',
                charge: 46.09,
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: 1,
                  summary: 1,
                  cost: 1,
                  charge: 1
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: 3,
                  summary: 3,
                  cost: 0.09,
                  charge: 0.09
                }, {
                  metric: 'heavy_api_calls',
                  quantity: 300,
                  summary: 300,
                  cost: 45,
                  charge: 45
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

        request.post(collector + '/v1/metering/resource/usage', {
          body: u.usage
        }, (err, val) => {
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
          return val.body.resources[0].aggregated_usage[1].summary;
        }
        catch (e) {
          // The response doesn't contain a valid report
          return 0;
        }
      };

      // Return the reporting day for the given time
      const day = (t) => {
        const d = new Date(t);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      };

      // Get a usage report for the test organization
      let gets = 0;
      const get = (done) => {
        request.get(reporting +
          '/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/usage/:time',
          {
            time: day(start)
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            // Compare the usage report we got with the expected report
            console.log('Processed %d usage docs', processed(val));
            try {
              expect(omit(val.body,
                ['id', 'start', 'end'])).to.deep.equal(report);
              console.log('\n', util.inspect(val.body, {
                depth: 10
              }), '\n');
              done();
            }
            catch (e) {
              // If the comparison fails we'll be called again to retry
              // after 1 second, give up after the configured timeout
              // still not getting the expected report then something
              // must have failed in the processing of that usage
              if(++gets === timeout / 250) {
                console.log('All submitted usage still not processed\n');
                throw e;
              }
            }
          });
      };

      // Wait for the expected usage report, get a report every 250 msec until
      // we get the expected values indicating that all submitted usage has
      // been processed
      const wait = (done) => {
        console.log('\nRetrieving usage report');
        const i = setInterval(() => get(() => done(clearInterval(i))), 250);
      };

      // Run the above steps
      map(usage, (u) => post(u, () => wait(done)));
    });
});

