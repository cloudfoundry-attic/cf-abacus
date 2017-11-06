'use strict';

const async = require('async');
const dbclient = require('abacus-dbclient');
const abacusCollectorMock = require('./lib/abacus-collector-mock')();
const cloudControllerMock = require('./lib/cloud-controller-mock')();
const httpStatus = require('http-status-codes');
const request = require('abacus-request');
const uaaServerMock = require('./lib/uaa-server-mock')();
const wait = require('./lib/wait');

const npm = require('abacus-npm');
const moment = require('abacus-moment');

const tokenSecret = 'secret';
const tokenAlgorithm = 'HS256';
const token = require('./lib/token')(tokenSecret);


describe('test', () => {

  const now = moment.now();
  const eventTimestamp = moment.utc(now).subtract(3, 'minutes').valueOf();

  const serviceEventUsage = {
    metadata: {
      created_at: eventTimestamp,
      guid: 'event-guid'
    },
    entity: {
      state: 'CREATED',
      org_guid: 'test-org',
      space_guid: 'space-guid',
      service_label: 'test-service',
      service_plan_name: 'test-plan',
      service_instance_guid: 'service-instance-guid'
    }
  };

  const expectedUsage = {
    start: eventTimestamp,
    end: eventTimestamp,
    organization_id: 'test-org',
    space_id: 'space-guid',
    consumer_id: 'service:service-instance-guid',
    resource_id: 'test-service',
    plan_id: 'test-plan',
    resource_instance_id: 'service:service-instance-guid:test-plan:test-service',
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
  };

  context('when all external systems are working', () => {

    before((done) => {
      const abacusCollectorAddress = abacusCollectorMock.start();
      const cloudControllerAddress = cloudControllerMock.start();
      const uaaServerAddress = uaaServerMock.start();

      uaaServerMock.tokenService.return.abacusCollector('abacus-collector-token');
      uaaServerMock.tokenService.return.cfAdmin('cfadmin-token');

      cloudControllerMock.serviceUsageEvents.return([serviceEventUsage]);

      cloudControllerMock.serviceGuids.return({
        'test-service': 'test-service-guid'
      });

      process.env.CLIENT_ID = 'abacus-collector-client-id';
      process.env.CLIENT_SECRET = 'abacus-collector-client-secret';
      process.env.CF_CLIENT_ID = 'cf-client-id';
      process.env.CF_CLIENT_SECRET = 'cf-client-secret';
      process.env.SECURED = 'true';
      process.env.ORGS_TO_REPORT = '["test-org"]';
      process.env.AUTH_SERVER = `http://localhost:${uaaServerAddress.port}`;
      process.env.API = `http://localhost:${cloudControllerAddress.port}`;
      process.env.COLLECTOR = `http://localhost:${abacusCollectorAddress.port}`;
      process.env.SERVICES = `{
        "test-service":{"plans":["test-plan"]}
      }`;
      process.env.MIN_INTERVAL_TIME = 10;
      process.env.JWTKEY = tokenSecret;
      process.env.JWTALGO = tokenAlgorithm;

      if (!process.env.DB)
        npm.startModules([npm.modules.pouchserver, npm.modules.services]);
      else
        dbclient.drop(process.env.DB, /^abacus-/, () => {
          npm.startModules(npm.modules.services);
        });

      wait.until(() => {
        return cloudControllerMock.serviceUsageEvents.requestsCount() >= 2;
      }, done);
    });

    after((done) => {
      async.parallel([
        npm.stopAllStarted,
        abacusCollectorMock.stop,
        cloudControllerMock.stop,
        uaaServerMock.stop
      ], done);
    });

    it('verify cloud controller calls', () => {
      // Expect 2 calls as configuration is load by both Master and Worker process
      expect(cloudControllerMock.serviceGuids.requestsCount()).to.equal(2);
      expect(cloudControllerMock.serviceGuids.received.token()).to.equal('cfadmin-token');
      expect(cloudControllerMock.serviceGuids.received.serviceLabels()).to.deep.equal(['test-service']);

      expect(cloudControllerMock.serviceUsageEvents.requests(0).token).to.equal('cfadmin-token');
      expect(cloudControllerMock.serviceUsageEvents.requests(1).token).to.equal('cfadmin-token');
      expect(cloudControllerMock.serviceUsageEvents.requests(0).serviceGuids).to.deep.equal(['test-service-guid']);
      expect(cloudControllerMock.serviceUsageEvents.requests(1).serviceGuids).to.deep.equal(['test-service-guid']);
      expect(cloudControllerMock.serviceUsageEvents.requests(0).afterGuid).to.equal(undefined);
      expect(cloudControllerMock.serviceUsageEvents.requests(1).afterGuid).to.equal('event-guid');
    });

    it('verify abacus collector calls', () => {
      expect(abacusCollectorMock.collectUsageService.requestsCount()).to.equal(1);
      expect(abacusCollectorMock.collectUsageService.requests(0).token).to.equal('abacus-collector-token');
      expect(abacusCollectorMock.collectUsageService.requests(0).usage).to.deep.equal(expectedUsage);
    });

    it('verify UAA calls', () => {
      // Expect 4 calls, 2 done by Worker, and 2 by Master process
      // TODO: check this!!!
      expect(uaaServerMock.tokenService.requestsCount()).to.equal(4);
      expect(uaaServerMock.tokenService.receivedCredentials.abacusCollector()).to.deep.equal({
        id: process.env.CLIENT_ID,
        secret: process.env.CLIENT_SECRET
      });
      expect(uaaServerMock.tokenService.receivedCredentials.cfAdmin()).to.deep.equal({
        id: process.env.CF_CLIENT_ID,
        secret: process.env.CF_CLIENT_SECRET
      });
    });

    context('when requesting statictics with NO token', () => {
      it('UNAUTHORIZED is returned', (done) => {
        request.get('http://localhost:9502/v1/stats', {
          port: 9502
        }, (error, response) => {
          expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
          done();
        });
      });
    });

    context('when requesting statictics with token with required scopes', () => {
      it('statistics are returned', (done) => {
        const signedToken = token.create(['abacus.usage.read']);
        request.get('http://localhost:9502/v1/stats', {
          port: 9502,
          headers: {
            authorization: `Bearer ${signedToken}`
          }
        }, (error, response) => {
          expect(response.statusCode).to.equal(httpStatus.OK);
          expect(response.body.statistics.usage).to.deep.equal({
            success : 1,
            conflicts : 0,
            skips : 0,
            failures : 0
          });
          done();
        });
      });
    });

    context('when requesting statictics with token with NO required scopes', () => {
      it('FORBIDDEN is returned', (done) => {
        const signedToken = token.create(['abacus.usage.invalid']);
        request.get('http://localhost:9502/v1/stats', {
          port: 9502,
          headers: {
            authorization: `Bearer ${signedToken}`
          }
        }, (error, response) => {
          expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
          done();
        });
      });
    });

  });

  // statistics (auth!!)
  // filtering
  // skipped unconverted events
  // timestamp adjusting
  // retry(s)
  // behavior when some external system is not available

});
