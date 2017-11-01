'use strict';

const dbclient = require('abacus-dbclient');
const abacusCollectorMock = require('./lib/abacus-collector-mock')();
const cloudControllerMock = require('./lib/cloud-controller-mock')();
const uaaServerMock = require('./lib/uaa-server-mock')();

// const request = require('request');
const npm = require('abacus-npm');
const moment = require('abacus-moment');

describe('test', () => {

  const waitUntil = (check, cb) => {
    if(!check())
      setTimeout(() => waitUntil(check, cb), 1500);
    else
      cb();
  };

  it('test', (done) => {
    const abacusCollectorAddress = abacusCollectorMock.start();
    const cloudControllerAddress = cloudControllerMock.start();
    const uaaServerAddress = uaaServerMock.start();

    uaaServerMock.returnAbacusCollectorToken('abacus-collector-token');
    uaaServerMock.returnCfAdminAccessToken('cfadmin-token');


    const now = moment.now();
    cloudControllerMock.returnEvents([{
      metadata: {
        created_at: moment.utc(now).subtract(3, 'minutes'),
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
    }]);

    cloudControllerMock.returnServiceGuids({
      'test-service': 'test-service-guid'
    });

    // cloudControllerMock.serviceGuids.return({});
    // cloudControllerMock.serviceGuids.recievedToken();

    // cloudControllerMock.serviceUsageEvents.return({});
    // cloudControllerMock.serviceUsageEvents.recievedToken();
    // cloudControllerMock.serviceUsageEvents.recievedBody();

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

    // process.env.GUID_MIN_AGE
    // process.env.LAST_RECORDED_GUID
    // process.env.JWTKEY
    // process.env.JWTALGO

    const modules = [npm.modules.services];

    if (!process.env.DB) {
      modules.push(npm.modules.pouchserver);
      npm.startModules(modules);
    }
    else
      dbclient.drop(process.env.DB, /^abacus-/, () => {
        npm.startModules(modules);
      });


    waitUntil(() => {
      return abacusCollectorMock.getReceivedRequetsCount() > 0;
    }, () => {
      expect(abacusCollectorMock.getReceivedOAuthToken()).to.equal('abacus-collector-token');
      expect(cloudControllerMock.getReceivedServicesOAuthToken()).to.equal('cfadmin-token');
      expect(cloudControllerMock.getReceivedServiceUsageEventsOAuthToken()).to.equal('cfadmin-token');

      expect(uaaServerMock.getReceivedAbacusCollectorCredentials().id).to.be.equal(process.env.CLIENT_ID);
      expect(uaaServerMock.getReceivedAbacusCollectorCredentials().secret).to.be.equal(process.env.CLIENT_SECRET);

      expect(uaaServerMock.getReceivedCfAdminCredentials().id).to.be.equal(process.env.CF_CLIENT_ID);
      expect(uaaServerMock.getReceivedCfAdminCredentials().secret).to.be.equal(process.env.CF_CLIENT_SECRET);



      npm.stopAllStarted(done);
    });


    // verify recieved usage
    // verify all the config is used correctly - oauth clients, secrets, ....
  });
});
