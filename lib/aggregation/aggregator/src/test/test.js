'use strict';

// Usage aggregator service.
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

const { omit, map } = require('underscore');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');
// const batch = require('abacus-batch');
// const transform = require('abacus-transform');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');
// const moment = require('abacus-moment');
// const brequest = batch(request);
const util = require('util');
const doPost = util.promisify(request.post);

// const debug = require('abacus-debug')('abacus-usage-aggregator-test');

const { buildAccumulatedUsage } = require('./templates');  
const { correctWindowsTestFixtures, shiftWindowsTestFixtures, aggregatesInitialUsageFixture,
  aggregatesWithExisitingUsageFixture } = require('./fixtures'); 
const { findAggregatorDocs } = require('./aggregatorDAO');
/* eslint handle-callback-err: 0 */

process.env.SINK = 'http://localhost:9400';
delete process.env.SAMPLING;

// Mock the request module
// let postspy, getspy;
// const reqmock = extend({}, request, {
//   batch_post: (reqs, cb) => postspy(reqs, cb),
//   batch_get: (reqs, cb) => getspy(reqs, cb)
// });
// require.cache[require.resolve('abacus-request')].exports = reqmock;
// getspy = brequest;

let aggregator;
let server;

// Expected output plan id
// const pid = 'basic/test-metering-plan/test-rating-plan/test-pricing-basic';
// const testResourceInstanceID = '0b39fa70-a65f-4183-bae8-385633ca5c87';
// const testOrgID = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
// const testSpaceID = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
// const testConsumerID = 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';


const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-usage-aggregator', () => {
  let sandbox;
  let clock;
  // let postStub;

  const cleanUpSeqId = () => {
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../lib/aggregator-config.js')];
    delete require.cache[require.resolve('abacus-seqid')];
  };

  const startAggregator = () => {
    cleanUpSeqId();
    aggregator = require('..');
    const app = aggregator(() => {});
    server = app.listen(0);
  };

  const setUpClock = (time) => {
    if (clock)
      clock.restore();
    clock = sandbox.useFakeTimers({
      now: time,
      toFake: ['Date']
    });
  };

  before(() => {
    // Delete test dbs on the configured db server
  });

  let validatorspy, authorizespy;
  beforeEach((done) => {

    sandbox = sinon.createSandbox();
    validatorspy = sandbox.spy((req, res, next) => next());
    sandbox.stub(oauth, 'validator').callsFake(() => validatorspy);
    authorizespy = sandbox.stub(oauth, 'authorize').callsFake(() => {});
    sandbox.stub(oauth, 'cache').callsFake(() => {});

    // postStub = sandbox.stub(request, 'batch_post');
    setUpClock(Date.UTC(2015, 0, 3, 12));
    dbclient.drop(dbEnv, /^abacus-aggregator-/, done);
  });

  afterEach(() => {
    sandbox.reset();
    sandbox.restore();
    server.close();
  });

  // const aggregateUsageTest = (msg, validateSecurityConfig) => it(msg, (done) => {
  //   // Define a sequence of accumulated usage for several resource instances
  //   // 0b39fa70-a65f-4183-bae8-385633ca5c87: consuming 6 for 30 mins.
  //   // 0b39fa70-a65f-4183-bae8-385633ca5c87: Updated to consume 8 till eternity
  //   // 1b39fa70-a65f-4183-bae8-385633ca5c88: consuming 3 for 33.33 mins.
  //   // 1b39fa70-a65f-4183-bae8-385633ca5c88: Updated to consume 2 till eternity
  //   // Daily Usage for both: 6 * 1/2 + 8 * 23.5 + 3 * 0.55 + 2 * 22.39 = ~237.44
  //   // Monthly Usage for both: 6 * 1/2 + 8 * 695.5 + 3 * 0.55 + 2 * 694.39 =
  //   //   ~6957.43
  //   let allPosts = 0;
  //   const verify = (done) => {
  //     // cachespy = spy();

  //     startAggregator();

  //     // Handle callback checks
  //     let checks = 0;
  //     const check = () => {
  //       if (++checks === 2) done();
  //     };

  //     let posts = 0;
  //     postspy = (reqs, cb) => {
  //       debug('Posted new aggregated usage %o', reqs);

  //       // Expect aggregated usage to be posted to a sink service
  //       expect(reqs[0][0]).to.equal('http://localhost:9400/v1/metering/aggregated/usage');
  //       // Expect the test organization aggregated values
  //       const org = reqs[0][1].body;

  //       expect(omit(org, 'id', 'processed', 'processed_id', 'accumulated_usage_id', 'spaces')).to.deep.equal(
  //         extend({}, omit(
  //           aggregateUsageTestFixtures.expected.organizationDocs[posts], 'accumulated_usage_id', 'spaces'))
  //       );
  //       for (let i = 0; i < org.spaces.length; i++) {
  //         expect(org.spaces[i].space_id).to.equal(
  //           aggregateUsageTestFixtures.expected.organizationDocs[posts].spaces[i].space_id);
  //         expect(org.spaces[i].t).to.equal(
  //           aggregateUsageTestFixtures.expected.organizationDocs[posts].spaces[i].t + '-0-0-0-' + allPosts);
  //       }
  //       // Expect the test consumer aggregated values
  //       const con = reqs[1][1].body;
  //       expect(omit(con, 'id', 'processed', 'processed_id', 'accumulated_usage_id')).to.deep.equal(
  //         extend({}, omit(aggregateUsageTestFixtures.expected.consumerDocs[posts], 'accumulated_usage_id'))
  //       );
  //       allPosts = allPosts + 1;
  //       posts = posts + 1;
        
  //       cb(undefined, [ [undefined, { statusCode: 201 }], [undefined, { statusCode: 201 }]]);

  //       if (posts === 4) check();
  //     };

  //     // Post accumulated usage to the aggregator
  //     const post = () => {
  //       // Post each usage doc
  //       transform.reduce(
  //         aggregateUsageTestFixtures.usage,
  //         (a, u, i, l, cb) => {
  //           const uval = extend({}, u);
  //           // Initialize oauth authorize spy
  //           // authorizespy = spy();

  //           request.post(
  //             'http://localhost::p/v1/metering/accumulated/usage',
  //             {
  //               p: server.address().port,
  //               body: uval
  //             },
  //             (err, val) => {
  //               expect(err).to.equal(undefined);

  //               // Expect a 201 with the location of the accumulated usage
  //               expect(val.statusCode).to.equal(201);
  //               expect(val.headers.location).to.not.equal(undefined);

  //               // Get accumulated usage back, expecting what we posted
  //               brequest.get(val.headers.location, {}, (err, val) => {
  //                 expect(err).to.equal(undefined);
  //                 expect(val.statusCode).to.equal(200);

  //                 expect(omit(val.body, 'id', 'processed', 'processed_id', 'accumulated_usage_id')).to.deep.equal(
  //                   omit(uval, 'id', 'processed', 'processed_id', 'accumulated_usage_id')
  //                 );

  //                 cb();
  //               });
  //             }
  //           );
  //         },
  //         undefined,
  //         () => {
  //           validateSecurityConfig();
  //           check();
  //         }
  //       );
  //     };

  //     post();
  //   };

  //   verify(done);
  // });


  const sendUsage = async (usage) => {
    const resp = await doPost('http://localhost::p/v1/metering/accumulated/usage', {
      p: server.address().port,
      body: usage
    });
    expect(resp.statusCode).to.equal(httpStatus.CREATED);
    return resp.headers.location;
  };
  
  const validateAggregatorOutput = (expected, actual) => {
    expect(expected[0]).to.deep.equal(actual[0], 'Organization document is not correct');
    expect(expected[1]).to.deep.equal(actual[1], 'Consumer document is not correct');
    expect(expected[2]).to.deep.equal(actual[2], 'Space document is not correct');
    expect(expected[3]).to.deep.equal(actual[3], 'Marker document is not correct');
  };

  const aggregatesInitialUsageForResource = (msg, validateSecurityConfig) => it(msg, async() => {
    startAggregator();
    await sendUsage(aggregatesInitialUsageFixture.usage);
    
    validateAggregatorOutput(await findAggregatorDocs(aggregatesInitialUsageFixture.usage), 
      aggregatesInitialUsageFixture.expected);
    validateSecurityConfig();
  });

  const aggregatesUsageWithExistingResource = (msg, validateSecurityConfig) => context(msg, async() => {
    
    beforeEach(async() => {
      startAggregator();
      await sendUsage(aggregatesInitialUsageFixture.usage);
    });

    it('with same resource id', async() => {
      await sendUsage(aggregatesWithExisitingUsageFixture.usage.withSameResourceId);
      const result = await findAggregatorDocs(aggregatesWithExisitingUsageFixture.usage.withSameResourceId);
      validateAggregatorOutput(result, 
        aggregatesWithExisitingUsageFixture.expected.withSameResourceId);
      validateSecurityConfig();
    });    

    it('with different resource id', async() => {
      await sendUsage(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId);
      const result = await findAggregatorDocs(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId);
      validateAggregatorOutput(result, 
        aggregatesWithExisitingUsageFixture.expected.withDifferentResourceId);
      validateSecurityConfig();
    });    
  });

  context('when secured is set', () => {
    const validateSecurityConfig = (expectedValidatorCallCount) => () => {
      expect(validatorspy.callCount).to.equal(expectedValidatorCallCount);
      expect(authorizespy.alwaysCalledWith(sinon.any, { system: ['abacus.usage.write'] }), 
        'Scopes are not correct').to.be.true;
    };

    beforeEach(() => {
      process.env.SECURED = true;
    });
    afterEach(() => {
      delete process.env.SECURED;
    });

    aggregatesInitialUsageForResource('aggregates initial usage for a resource', validateSecurityConfig(1));

    aggregatesUsageWithExistingResource('aggregates usage to an existing resource id', validateSecurityConfig(2));
  });

  context('when secured is not set', () => {
    beforeEach(() => {
      process.env.SECURED = false;
    });

    aggregatesInitialUsageForResource('aggregates usage for an organization', () => {
      expect(validatorspy.callCount).to.equal(0);
    });

    aggregatesUsageWithExistingResource('aggregates usage to an existing resource id', () => {
      expect(validatorspy.callCount).to.equal(0);
    });
  });

  it.skip('selects the correct time window to aggregate to', (done) => {
    let records = 0;
    setUpClock(Date.UTC(2016, 0, 31, 12));
    startAggregator();

    const postFeb = () => {
      setUpClock(Date.UTC(2016, 1, 1, 8));
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: correctWindowsTestFixtures.usage[1]
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          request.post(
            'http://localhost::p/v1/metering/accumulated/usage',
            {
              p: server.address().port,
              body: correctWindowsTestFixtures.usage[2]
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(201);
            }
          );
        }
      );
    };

    postspy = (reqs, cb) => {
      records++;
      if (records === 1) postFeb();
      if (records === 3) {
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows).to.deep.equal(
          correctWindowsTestFixtures.expected);
        done();
      }

      cb(undefined, [[ undefined, { statusCode: 201 }],
        [ undefined, { statusCode: 201 }]]);
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: correctWindowsTestFixtures.usage[0]
      },
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
      }
    );
  });

  it.skip('shifts all windows successfully', (done) => {
    let records = 0;

    setUpClock(Date.UTC(2016, 3, 30));
    startAggregator();
    
    postspy = (reqs, cb) => {
      records++;
      if (records === 3) {
        const org = reqs[0][1].body;
        expect(org.resources[0].plans[0].aggregated_usage[0]).to.deep.equal(shiftWindowsTestFixtures.expected);
        expect(org.resources[0].plans[1]).to.be.undefined;
        done();
      }

      cb(undefined, [[ undefined, { statusCode: 201 }],
        [ undefined, { statusCode: 201 }]]);
    };

    const post = (u, done) => {
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: u
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          if (done) done();
        }
      );
    };
    post(shiftWindowsTestFixtures.usage[0], () =>
      post(shiftWindowsTestFixtures.usage[1], () => {
        setUpClock(Date.UTC(2016, 4, 1));
        post(shiftWindowsTestFixtures.usage[2]);
      })
    );
  });

  it.skip('attaches error and reasons when there is a business error', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    setUpClock(Date.UTC(2015, 0, 3, 5));
    startAggregator();
    // // Create a test accumulator app
    // const app = aggregator(systemToken);

    // // Listen on an ephemeral port
    // const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if (++checks === 2) done();
    };

    const usage = {
      collected_usage_id: 'collector-id',
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: 14202432000034,
      end: 1420243200034,
      plan_id: 'basic',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-errorcf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-errorb6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-errorbab',
      resource_type: 'test-resource-type',
      account_id: '12345',
      pricing_country: 'USA',
      metering_plan_id: 'invalid-metering-plan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic'
    };

    usage.accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [[null], [null], [null], [5, null, null], [5, null]]
      }
    ];

    getspy = (reqs, cb) => {
      // Expect a call to the provisioning service's get metering plan
      expect(reqs[0][0]).to.equal('http://localhost:9880/v1/metering/plans/:metering_plan_id');
      expect(reqs[0][1]).to.deep.equal({
        metering_plan_id: 'invalid-metering-plan'
      });
      cb(undefined, [[ undefined, { statusCode: 404 }]]);

      check();
    };
    
    startAggregator();
    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: usage
      },
      (err, val) => {
        expect(val).to.equal(undefined);
        expect(err).to.be.an('Error');
        expect(err).to.have.property('code', 500);
        expect(err).to.have.property('statusCode', 500);
        expect(err).to.have.property('error', 'emplannotfound');
        expect(err).to.have.property('reason', 'Metering plan with id invalid-metering-plan not found');
        expect(err).to.have.property('cause').that.deep.equals({
          statusCode: 404
        });
        // console.log(err.headers.location);
        // Get normalized usage back, expecting what we posted
        request.get(err.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id', 'processed', 'processed_id', 'accumulated_usage_id')).to.deep.equal(
            omit(usage, 'id')
          );

          check();
        });
      }
    );
  });

  it.skip('takes error and reason from the sink and returns it', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    setUpClock(Date.UTC(2015, 0, 3, 5));
    startAggregator();

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if (++checks === 2) done();
    };

    const usage = {
      collected_usage_id: '666',
      resource_id: 'test-error',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: 14202432000034,
      end: 1420243200034,
      plan_id: 'error',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-errorcf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-errorb6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-errorbab',
      resource_type: 'test-error',
      account_id: '12345',
      pricing_country: 'USA',
      metering_plan_id: 'test-metering-plan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic',
      prices: {
        metrics: [
          {
            name: 'heavy_api_calls',
            price: 1
          }
        ]
      },
      accumulated_usage: [
        {
          metric: 'heavy_api_calls',
          windows: [
            [null],
            [null],
            [null],
            [{ quantity: { previous: null, current: 5 } }, null, null],
            [{ quantity: { previous: null, current: 5 } }, null]
          ]
        }
      ]
    };

    const planNotFoundError = {
      error: 'emplannotfound',
      reason: 'Metering plan with id test-metering-plan not found',
      cause: {
        statusCode: 404
      }
    };

    postspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal('http://localhost:9400/v1/metering/aggregated/usage');

      // Simulates business error in abacus-aggregator
      cb(undefined, [ [undefined, { statusCode: 201, body: planNotFoundError }],
        [ undefined, { statusCode: 201 }]]);

      check();
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: usage
      },
      (err, val) => {
        expect(val).to.equal(undefined);
        expect(err).to.be.an('Error');  
        expect(err).to.have.property('code', 500);
        expect(err).to.have.property('statusCode', 500);
        expect(err).to.have.property('error', 'esink');
        expect(err).to.have.property('reason').that.deep.equals([planNotFoundError]);

        // Get normalized usage back, expecting what we posted
        request.get(err.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(usage);

          check();

        });
      }
    );
  });

  it.skip('processed time falls in prev day/month', (done) => {
    process.env.SLACK = '1D';
    clock.restore();
    let records = 0;
    const usage = [
      buildAccumulatedUsage('p', 1467244799999, 1467244799999, 1467244799999),
      buildAccumulatedUsage('p', 1467331199999, 1467331199999, 1467331199999),
      buildAccumulatedUsage('p', 1467417599999, 1467417599999, 1467417599999),
      buildAccumulatedUsage('p', 1467503999999, 1467503999999, 1467503999999)
    ];

    map(usage, (u) => {
      u.organization_id = 'timeorg';
    });

    usage[0].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 100 } }, null],
          [{ quantity: { current: 100 } }, null]
        ]
      }
    ];
    usage[1].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 200 } }, { quantity: { current: 100 } }],
          [{ quantity: { previous: 100, current: 300 } }, null]
        ]
      }
    ];

    usage[2].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 300 } }, { quantity: { current: 200 } }],
          [{ quantity: { current: 300 } }, { quantity: { previous: 100, current: 300 } }]
        ]
      }
    ];

    usage[3].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 400 } }, { quantity: { current: 300 } }],
          [
            { quantity: { previous: 300, current: 700 } },
            { quantity: { previous: 100, current: 300 } }
          ]
        ]
      }
    ];

    // Expected values for the plan aggregation
    const expectedBasic = {
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [null, { quantity: 400, previous_quantity: null }],
        [{ quantity: 700, previous_quantity: 300 }, null]
      ]
    };

    startAggregator();
    postspy = (reqs, cb) => {
      records++;
      cb(undefined, [[ undefined, { statusCode: 201 }], 
        [ undefined, { statusCode: 201 }]]);
      if (records === 4) {
        const org = reqs[0][1].body;
        expect(org.resources[0].plans[0].aggregated_usage[0]).to.deep.equal(expectedBasic);
        done();
      }
    };

    const post = (u, done) => {
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: u
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          if (done) done();
        }
      );
    };

    setUpClock(usage[0].processed + 1);
    post(usage[0], () => {
      setUpClock(usage[1].processed + 1);
      post(usage[1], () => {
        setUpClock(usage[2].processed + 1);
        post(usage[2], () => {
          setUpClock(usage[3].processed + 1);
          post(usage[3], () => {});
        });
      });
    });
  });
});
