'use strict';

// Usage aggregator service.
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

const { omit } = require('underscore');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');
const util = require('util');

const doPost = util.promisify(request.post);
const doGet = util.promisify(request.get);
const dropDatabase = util.promisify(dbclient.drop);

// const debug = require('abacus-debug')('abacus-usage-aggregator-test');

const { aggregatesInitialUsageFixture, aggregatesWithExisitingUsageFixture, 
  shiftsMonthWindowsFixture, aggregatesWithZeroFixture, aggregatedUsage } = require('./fixtures/fixtures'); 
const { findAggregatorDocs } = require('./aggregatorDAO');

// process.env.SINK = 'http://localhost:9400';
delete process.env.SAMPLING;

let aggregator;
let server;

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-usage-aggregator', () => {
  let sandbox;
  let clock;

  const cleanUpAggregatorDependancies = () => {
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../lib/aggregator-config.js')];
    delete require.cache[require.resolve('abacus-seqid')];
  };

  const startAggregator = () => {
    cleanUpAggregatorDependancies();
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

  let validatorspy, authorizespy;
  beforeEach(async() => {
    sandbox = sinon.createSandbox();
    validatorspy = sandbox.spy((req, res, next) => next());
    sandbox.stub(oauth, 'validator').callsFake(() => validatorspy);
    authorizespy = sandbox.stub(oauth, 'authorize').callsFake(() => {});
    sandbox.stub(oauth, 'cache').callsFake(() => {});

    await dropDatabase(dbEnv, /^abacus-aggregator-/);
    setUpClock(Date.UTC(2015, 9, 31, 12));
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

  const sendUsage = async (usage) => await doPost('http://localhost::p/v1/metering/accumulated/usage', {
    p: server.address().port,
    body: usage
  });

  const sendUsageAndValidateResponse = async(usage) => {
    const resp = await sendUsage(usage);
    expect(resp.statusCode).to.equal(httpStatus.CREATED);

    return resp.headers.location;
  };
  
  const cleanUsageDoc = (usage) => omit(usage, 'id', 'processed', 'processed_id', 'accumulated_usage_id');
  
  const getUsageDoc = async (locationHeader) => {
    const resp = await doGet(locationHeader);
    
    expect(resp.statusCode).to.equal(httpStatus.OK);
    return cleanUsageDoc(resp.body);
  };
  
  const validateAggregatorOutput = (expected, actual) => {
    expect(expected[0]).to.deep.equal(actual[0], 'Organization document is not correct');
    expect(expected[1]).to.deep.equal(actual[1], 'Consumer document is not correct');
    expect(expected[2]).to.deep.equal(actual[2], 'Space document is not correct');
    expect(expected[3]).to.deep.equal(actual[3], 'Marker document is not correct');
  };

  const aggregatesInitialUsageForResource = (msg, validateSecurityConfig) => it(msg, async() => {
    startAggregator();
    await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
    
    validateAggregatorOutput(await findAggregatorDocs(aggregatesInitialUsageFixture.usage), 
      aggregatesInitialUsageFixture.expected);
    validateSecurityConfig();
  });

  const aggregatesUsageWithExistingResource = (msg, validateSecurityConfig) => context(msg, async() => {
    
    beforeEach(async() => {
      startAggregator();
      await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
    });
    // DO WE NEED result constant ??????????
    it('with same resource instance id', async() => {
      await sendUsageAndValidateResponse(aggregatesWithExisitingUsageFixture.usage.withSameResourceId);
      const result = await findAggregatorDocs(aggregatesWithExisitingUsageFixture.usage.withSameResourceId);
      validateAggregatorOutput(result, 
        aggregatesWithExisitingUsageFixture.expected.withSameResourceId);
      validateSecurityConfig();
    });    

    it('with different resource instance id', async() => {
      await sendUsageAndValidateResponse(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId);
      const result = await findAggregatorDocs(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId);
      validateAggregatorOutput(result, 
        aggregatesWithExisitingUsageFixture.expected.withDifferentResourceId);
      validateSecurityConfig();
    });    
  });

  const getByLocationHeader = (msg, validateSecurityConfig) => context(msg, async() => {
    context('when initial usage is sent', () => {
      it('returns correct document', async() => {
        startAggregator();
        const locationHeader = await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
        const expectedDoc = await getUsageDoc(locationHeader);

        expect(expectedDoc).to.deep.equal(cleanUsageDoc(aggregatesInitialUsageFixture.usage));
        validateSecurityConfig();
      });
    });
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

    getByLocationHeader('get by location header', () => {
      expect(validatorspy.callCount).to.equal(0);
    });

    context('when business error occurs', async() => {
      let response;
      let mconfigStub;
      let abacusMConfigModule;
      const expectedError = {
        error: 'emplannotfound', 
        reason: 'Metering plan with id test-metering-plan not found', 
        cause: {
          statusCode: httpStatus.NOT_FOUND
        } 
      };

      beforeEach(async() => {
        mconfigStub = sandbox.stub().yields(undefined, expectedError);
        abacusMConfigModule = stubModule('abacus-metering-config');
        abacusMConfigModule.stubMainFunc(mconfigStub);
        startAggregator();
  
        try {
          await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
        } catch(err) {
          response = err;
        }; 
      });
  
      afterEach(() => {
        abacusMConfigModule.restore();
        abacusMConfigModule.unstub();
      });
  
      it('returns error', () => {
        expect(mconfigStub.callCount).to.equal(1);
        expect(response.statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
        expect(response.error).to.equal(expectedError.error);
        expect(response.reason).to.equal(expectedError.reason);
        expect(response.cause).to.deep.equal(expectedError.cause);
      });
  
      it('stores error document in errorDB', async() => {
        expect(await getUsageDoc(response.headers.location))
          .to.deep.equal(cleanUsageDoc(aggregatesInitialUsageFixture.usage));;
      });
    });

    context('when aggregates with NaN, null or undefined', () => {
      beforeEach(async() => {
        startAggregator();
        await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
      });

      it('throws error if aggregate function returns NaN', async() => {
        const resp = await sendUsage(aggregatedUsage.withNaN);
  
        expect(resp.statusCode).to.equal(httpStatus.UNPROCESSABLE_ENTITY);
        expect(resp.statusMessage).to.equal('Unprocessable Entity');
      });

      it('throws error if aggregate function returns Null', async() => {
        const resp = await sendUsage(aggregatedUsage.withNull);
  
        expect(resp.statusCode).to.equal(httpStatus.UNPROCESSABLE_ENTITY);
        expect(resp.statusMessage).to.equal('Unprocessable Entity');
      });

      it('throws error if aggregate function returns undefined', async() => {
        const resp = await sendUsage(aggregatedUsage.withUndefined);
  
        expect(resp.statusCode).to.equal(httpStatus.UNPROCESSABLE_ENTITY);
        expect(resp.statusMessage).to.equal('Unprocessable Entity');
      });
    });

    it('month and day windows successfully', async() => {
      startAggregator();
      await sendUsageAndValidateResponse(shiftsMonthWindowsFixture.usage[0]);
      await sendUsageAndValidateResponse(shiftsMonthWindowsFixture.usage[1]);
      const result = await findAggregatorDocs(shiftsMonthWindowsFixture.usage[1]);
      validateAggregatorOutput(result, shiftsMonthWindowsFixture.expected);
    });

    it('aggregates with zero', async() => {
      startAggregator();
      await sendUsageAndValidateResponse(aggregatesWithZeroFixture.usage[0]);
      await sendUsageAndValidateResponse(aggregatesWithZeroFixture.usage[1]);
      const result = await findAggregatorDocs(aggregatesWithZeroFixture.usage[1]);
      validateAggregatorOutput(result, aggregatesWithZeroFixture.expected);
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

    aggregatesInitialUsageForResource('aggregates initial usage for a resource instance', validateSecurityConfig(1));

    aggregatesUsageWithExistingResource('aggregates usage to an existing resource instance', validateSecurityConfig(2));

    getByLocationHeader('get by location header', () => {
      expect(validatorspy.callCount).to.equal(2);
      assert.calledWith(authorizespy.firstCall, sinon.match.any, sinon.match({ system: ['abacus.usage.write'] }));  
      assert.calledWith(authorizespy.secondCall, sinon.match.any, sinon.match({ system: ['abacus.usage.read'] }));  
    });
  });

});
