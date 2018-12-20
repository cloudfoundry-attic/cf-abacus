'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

const { omit } = require('underscore');
const httpStatus = require('http-status-codes');

const dbclient = require('abacus-dbclient');
const request = require('abacus-request');
const oauth = require('abacus-oauth');
const util = require('util');

const doPost = util.promisify(request.post);
const doGet = util.promisify(request.get);
const dropDatabase = util.promisify(dbclient.drop);

const { aggregatesInitialUsageFixture, aggregatesWithExisitingUsageFixture, 
  shiftsMonthWindowsFixture, aggregatesWithZeroFixture, unprocessableEntityFixture, 
  previousMonthFixture } = require('./fixtures/usages'); 
const { times } = require('./fixtures/usageDocumentFieldsConstants');  
const { findAggregatorDocs } = require('./aggregatorDAO');

delete process.env.SAMPLING;

let aggregator;
let server;

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-usage-aggregator', () => {
  let sandbox;
  let clock;
  let validatorspy;
  let authorizespy;

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
    expect(actual[0]).to.deep.equal(expected[0], 'Organization document is not correct');
    expect(actual[1]).to.deep.equal(expected[1], 'Consumer document is not correct');
    expect(actual[2]).to.deep.equal(expected[2], 'Space document is not correct');
    expect(actual[3]).to.deep.equal(expected[3], 'Marker document is not correct');
  };

  beforeEach(async() => {
    sandbox = sinon.createSandbox();
    validatorspy = sandbox.spy((req, res, next) => next());
    sandbox.stub(oauth, 'validator').callsFake(() => validatorspy);
    authorizespy = sandbox.stub(oauth, 'authorize').callsFake(() => {});
    sandbox.stub(oauth, 'cache').callsFake(() => {});
    
    await dropDatabase(dbEnv, /^abacus-aggregator-/);
    setUpClock(times.endOfOctoberTwelvePM);
  });

  afterEach(() => {
    sandbox.reset();
    sandbox.restore();
    server.close();
  });

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

    it('with same resource instance id', async() => {
      await sendUsageAndValidateResponse(aggregatesWithExisitingUsageFixture.usage.withSameResourceId);
      
      validateAggregatorOutput(await findAggregatorDocs(aggregatesWithExisitingUsageFixture.usage.withSameResourceId), 
        aggregatesWithExisitingUsageFixture.expected.withSameResourceId);
      validateSecurityConfig();
    });    

    it('with different resource instance id', async() => {
      await sendUsageAndValidateResponse(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId);
      
      validateAggregatorOutput(
        await findAggregatorDocs(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId), 
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
          .to.deep.equal(cleanUsageDoc(aggregatesInitialUsageFixture.usage));
      });
    });

    context('when aggregates with NaN, null or undefined', () => {
      beforeEach(async() => {
        startAggregator();
        await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
      });

      const validateUnprocessableEntityResponse = (response) => {
        expect(response.statusCode).to.equal(httpStatus.UNPROCESSABLE_ENTITY);
        expect(response.statusMessage).to.equal('Unprocessable Entity');
      };

      it('throws error if aggregate function returns NaN', async() => {
        validateUnprocessableEntityResponse(await sendUsage(unprocessableEntityFixture.withNaN));
      });

      it('throws error if aggregate function returns Null', async() => {
        validateUnprocessableEntityResponse(await sendUsage(unprocessableEntityFixture.withNull));
      });

      it('throws error if aggregate function returns undefined', async() => {
        validateUnprocessableEntityResponse(await sendUsage(unprocessableEntityFixture.withUndefined));
      });
    });

    context('when usage for previous month is sent', () => {
      beforeEach(async() => {
        startAggregator();
        await sendUsage(previousMonthFixture.usage.october.twelveThirtyAM);
        setUpClock(times.startOfNovemberTenPM);
      });

      it('input and output is stored in previous month DB', async() => {
        await sendUsage(previousMonthFixture.usage.november);

        validateAggregatorOutput(previousMonthFixture.expected.october.firstDoc, 
          await findAggregatorDocs(previousMonthFixture.usage.october.twelveThirtyAM));
        validateAggregatorOutput(previousMonthFixture.expected.november.firstDoc, 
          await findAggregatorDocs(previousMonthFixture.usage.november));
      });

      it('previous gets aggregated properly', async() => {
        await sendUsage(previousMonthFixture.usage.october.oneAM);

        validateAggregatorOutput(previousMonthFixture.expected.october.secondDoc, 
          await findAggregatorDocs(previousMonthFixture.usage.october.oneAM));
        expect(await findAggregatorDocs(previousMonthFixture.usage.november)).to.have.length(0);
      });
    });

    it('shifts month and day windows successfully', async() => {
      startAggregator();
      await sendUsageAndValidateResponse(shiftsMonthWindowsFixture.usage.october.twelveThirtyAM);
      await sendUsageAndValidateResponse(shiftsMonthWindowsFixture.usage.november.fourAM);
      
      validateAggregatorOutput(await findAggregatorDocs(shiftsMonthWindowsFixture.usage.november.fourAM), 
        shiftsMonthWindowsFixture.expected);
    });

    it('aggregates with zero', async() => {
      startAggregator();
      await sendUsageAndValidateResponse(aggregatesWithZeroFixture.usage.october.twelveThirtyAM);
      await sendUsageAndValidateResponse(aggregatesWithZeroFixture.usage.october.oneAM);
      
      validateAggregatorOutput(await findAggregatorDocs(aggregatesWithZeroFixture.usage.october.oneAM), 
        aggregatesWithZeroFixture.expected);
    });
  });
});
