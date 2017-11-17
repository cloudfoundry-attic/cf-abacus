'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');
const npm = require('abacus-npm');
const yieldable = require('abacus-yieldable');

const renewer = require('./fixtures/utils/renewer')({
  SLACK: '32D'
});
const serviceMock = require('./test-definitions/utils/service-mock-util');
const carryOverDb = require('./test-definitions/utils/carry-over-db');
// const createExternalSystemsMocks = require('./fixtures/utils/external-systems');

const createAbacusCollectorMock = require('./server-mocks/abacus-collector-mock');
// const createCloudControllerMock = require('../server-mocks/applications-cloud-collector-mock');
const createUAAServerMock = require('./server-mocks/uaa-server-mock');

const eventTimestampGenerator = require('./fixtures/utils/event-timestamp-generator')();

const wait = require('./test-definitions/utils/wait');

// const createBridge = require('./fixtures/utils/bridge');

const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const cfAdminScopes = [];
const abacusCollectorToken = 'abacus-collector-token';
const cfAdminToken = 'cfadmin-token';

// FIXME:
// const renewer = createBridge({
//   bridge: npm.modules.renewer,
//   port: 9501
// });

const startRenewer = yieldable(renewer.start);
// const drop = yieldable(dbClient.drop);
const waitUntil = yieldable(wait.until);

describe('renewer test', () => {
  let uaaServerMock;
  let abacusCollectorMock;

  const now = moment.now();
  const eventTimestamp = moment
    .utc(now)
    .subtract(1, 'month')
    .endOf('month')
    .subtract('1', 'hour')
    .valueOf();

  const populateDB = function *() {
    yield carryOverDb.put({
      collector_id: 1,
      event_guid: 'event-guid',
      state: 'STARTED',
      timestamp: eventTimestamp
    });
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
        code: 200,
        body: {
          id: 1,
          start: 1,
          end: 2,
          state: 'STARTED',
          measured_usage: [
            {
              measure: 'current_instances',
              quantity : 1
            },
            {
              measure: 'previous_instances',
              quantity : 0
            }
          ]
        }
      });

    abacusCollectorMock
      .collectUsageService
      .return
      .always(httpStatus.CREATED);

    uaaServerMock.start();
    abacusCollectorMock.start();

    yield carryOverDb.setup();
    yield populateDB();
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

  it('test', () => {
    // verify abacus collector recieved requests
    // verify statitics
    // verify new carry over content
  });



  // out of slack
  // conflict
  // unsupported states?
  // abacus collector down???

  // report bug - collector ok, carry over db - down, when reporting retries
  // collector will return 409 and no data will be written in carryOver db
  // (250-270 line of renewer)


});
