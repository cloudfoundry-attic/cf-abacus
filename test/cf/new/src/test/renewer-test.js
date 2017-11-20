'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');
const npm = require('abacus-npm');
const request = require('abacus-request');
const yieldable = require('abacus-yieldable');


// FIXME: dynamically calculate this value???
const renewer = require('./fixtures/utils/renewer')({
  SLACK: '32D'
});
const carryOverDb = require('./test-definitions/utils/carry-over-db');
const serviceMock = require('./test-definitions/utils/service-mock-util');
const createTokenFactory = require('./test-definitions/utils/token-factory');
const wait = require('./test-definitions/utils/wait');

const createAbacusCollectorMock = require('./server-mocks/abacus-collector-mock');
const createUAAServerMock = require('./server-mocks/uaa-server-mock');


const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const abacusCollectorToken = 'abacus-collector-token';

const startRenewer = yieldable(renewer.start);
const waitUntil = yieldable(wait.until);

const usage = () => {
  let timestamp;
  let currentInstances;
  let previousInstances;
  const builder = {
    withTimestamp: (value) => {
      timestamp = value;
      return builder;
    },
    withCurrentInstances: (value) => {
      currentInstances = value;
      return builder;
    },
    withPreviousInstances: (value) => {
      previousInstances = value;
      return builder;
    },
    build: () => ({
      start: timestamp,
      end: timestamp,
      organization_id: 'org-id',
      space_id: 'space-id',
      consumer_id: 'consumer-id',
      resource_id: 'resource-id',
      plan_id: 'plan-id',
      resource_instance_id: 'resource-instance-id',
      measured_usage: [
        {
          measure: 'current_instances',
          quantity : currentInstances
        },
        {
          measure: 'previous_instances',
          quantity : previousInstances
        }
      ]
    })
  };

  return builder;
};

describe('renewer test', () => {
  let uaaServerMock;
  let abacusCollectorMock;

  const now = moment.now();
  const startOfMonth = moment.utc(now).startOf('month').valueOf();
  const eventTimestamp = moment
    .utc(now)
    .subtract(1, 'month')
    .endOf('month')
    .subtract('1', 'hour')
    .valueOf();

  const preparedCarryOverContent = {
    collector_id: 1,
    event_guid: 'event-guid',
    state: 'STARTED',
    timestamp: eventTimestamp
  };

  before((done) => yieldable.functioncb(function *() {
    uaaServerMock = createUAAServerMock();
    abacusCollectorMock = createAbacusCollectorMock();

    uaaServerMock
      .tokenService
      .whenScopes(abacusCollectorScopes)
      .return(abacusCollectorToken);

    abacusCollectorMock
      .getUsageService
      .return
      .always({
        statusCode: 200,
        body: usage()
          .withTimestamp(1)
          .withCurrentInstances(2)
          .withPreviousInstances(1)
          .build()
      });

    abacusCollectorMock
      .collectUsageService
      .return
      .always(httpStatus.CREATED);

    uaaServerMock.start();
    abacusCollectorMock.start();

    yield carryOverDb.setup();
    yield carryOverDb.put(preparedCarryOverContent);
    yield startRenewer(abacusCollectorMock, uaaServerMock);

    yield waitUntil(serviceMock(abacusCollectorMock.collectUsageService).received(1));
  })((err) => {
    done(err);
  }));

  after((done) => {
    async.parallel([
      npm.stopAllStarted,
      uaaServerMock.stop,
      abacusCollectorMock.stop
    ], done);
  });

  context('verify abacus collector receieved correct requests', () => {

    it('verify collector received requests count', () => {
      expect(abacusCollectorMock.collectUsageService.requests().length).to.equal(1);
    });

    it('verify received usage', () => {
      expect(abacusCollectorMock.collectUsageService.request(0).usage).to.deep.equal(
        usage()
          .withTimestamp(startOfMonth)
          .withCurrentInstances(2)
          .withPreviousInstances(0)
          .build()
      );
    });

    it('verify received token', () => {
      expect(abacusCollectorMock.collectUsageService.request(0).token).to.equal(abacusCollectorToken);
    });
  });

  it('verify carry-over content', (done) => yieldable.functioncb(function *() {
    const docs = yield carryOverDb.readCurrentMonthDocs();
    expect(docs).to.deep.equal([
      preparedCarryOverContent,
      {
        collector_id: abacusCollectorMock.collectUsageService.resourceLocation,
        event_guid: preparedCarryOverContent.event_guid,
        state: preparedCarryOverContent.state,
        timestamp: startOfMonth
      }
    ]);
  })((err) => {
    done(err);
  }));

  it('verify correct statistics are returned', (done) => {
    const tokenFactory = createTokenFactory(renewer.env.tokenSecret);
    const signedToken = tokenFactory.create(['abacus.usage.read']);
    request.get('http://localhost::port/v1/cf/renewer', {
      port: renewer.port,
      headers: {
        authorization: `Bearer ${signedToken}`
      }
    }, (error, response) => {
      expect(response.statusCode).to.equal(httpStatus.OK);
      expect(response.body.renewer.statistics.usage.report).to.deep.equal({
        success: 1,
        conflicts : 0,
        failures : 0
      });
      expect(response.body.renewer.statistics.usage.get).to.includes({
        success: 1,
        failures : 0
      });
      done();
    });
  });


  // out of slack
  // unsupported states?
  // conflict
  // abacus collector down???

  // report bug - collector ok, carry over db - down, when reporting retries
  // collector will return 409 and no data will be written in carryOver db
  // (250-270 line of renewer)


});
