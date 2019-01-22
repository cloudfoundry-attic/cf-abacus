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
  previousMonthFixture, shiftDayWindowsFixture } = require('./fixtures/usages');
const { times } = require('./fixtures/usageDocumentFieldsConstants');
const { outputDocs, inputDoc } = require('./aggregatorDAO');

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

  const cleanUsageDoc = (usage) => omit(usage, 'id', 'processed_id', 'accumulated_usage_id');

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

  const aggregatesInitialUsageForResource = (validateAuthorization) =>
    context('when posting initial usage', async() => {
      beforeEach(async() => {
        startAggregator();
        await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
      });

      it('stores aggregated document in the output db', async() => {
        validateAggregatorOutput(await outputDocs(aggregatesInitialUsageFixture.usage),
          aggregatesInitialUsageFixture.expected);
      });

      it('stores incoming document in the input db', async() => {
        expect(cleanUsageDoc(await inputDoc(aggregatesInitialUsageFixture.usage)))
          .to.deep.equal(cleanUsageDoc(aggregatesInitialUsageFixture.usage));
      });

      it('validates authorization', () => {
        validateAuthorization();
      });
    });

  const aggregatesUsageWithExistingResource = (validateSecurityConfig) =>
    context('aggregates usage to an existing resource instance', async() => {

      beforeEach(async() => {
        startAggregator();
        await sendUsageAndValidateResponse(aggregatesInitialUsageFixture.usage);
      });

      it('with same resource instance id', async() => {
        await sendUsageAndValidateResponse(aggregatesWithExisitingUsageFixture.usage.withSameResourceId);

        validateAggregatorOutput(
          await outputDocs(aggregatesWithExisitingUsageFixture.usage.withSameResourceId),
          aggregatesWithExisitingUsageFixture.expected.withSameResourceId);
        validateSecurityConfig();
      });

      it('with different resource instance id', async() => {
        await sendUsageAndValidateResponse(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId);

        validateAggregatorOutput(
          await outputDocs(aggregatesWithExisitingUsageFixture.usage.withDifferentResourceId),
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

    aggregatesInitialUsageForResource(validateSecurityConfig(1));

    aggregatesUsageWithExistingResource(validateSecurityConfig(2));

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

    aggregatesInitialUsageForResource(() => {
      expect(validatorspy.callCount).to.equal(0);
    });

    aggregatesUsageWithExistingResource(() => {
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
          await outputDocs(previousMonthFixture.usage.october.twelveThirtyAM));
        validateAggregatorOutput(previousMonthFixture.expected.november.firstDoc,
          await outputDocs(previousMonthFixture.usage.november));
      });

      it('previous gets aggregated properly', async() => {
        await sendUsage(previousMonthFixture.usage.october.oneAM);

        validateAggregatorOutput(previousMonthFixture.expected.october.secondDoc,
          await outputDocs(previousMonthFixture.usage.october.oneAM));
        expect(await outputDocs(previousMonthFixture.usage.november)).to.have.length(0);
      });
    });

    it('shifts month windows correctly', async() => {
      startAggregator();
      await sendUsageAndValidateResponse(shiftsMonthWindowsFixture.usage.october.twelveThirtyAM);
      await sendUsageAndValidateResponse(shiftsMonthWindowsFixture.usage.november.fourAM);

      validateAggregatorOutput(await outputDocs(shiftsMonthWindowsFixture.usage.november.fourAM),
        shiftsMonthWindowsFixture.expected);
    });

    context('when send usage for previous day', () => {
      beforeEach(async() => {
        setUpClock(times.startOfNovemberTenPM);
        startAggregator();
        await sendUsageAndValidateResponse(shiftDayWindowsFixture.usage.november.first);
        setUpClock(times.fifthOfNovemberTenAM);
      });

      it('shifts day windows correctly', async() => {
        await sendUsageAndValidateResponse(shiftDayWindowsFixture.usage.november.fourth);

        validateAggregatorOutput(await outputDocs(shiftDayWindowsFixture.usage.november.fourth),
          shiftDayWindowsFixture.expected);
      });
    });

    it('aggregates with zero', async() => {
      startAggregator();
      await sendUsageAndValidateResponse(aggregatesWithZeroFixture.usage.october.twelveThirtyAM);
      await sendUsageAndValidateResponse(aggregatesWithZeroFixture.usage.october.oneAM);

      validateAggregatorOutput(await outputDocs(aggregatesWithZeroFixture.usage.october.oneAM),
        aggregatesWithZeroFixture.expected);
    });
  });
});
