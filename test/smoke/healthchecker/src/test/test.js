'use strict';

/* eslint-disable no-unused-expressions */

const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-healthchecker-smoke-test');

const testEnv = {
  healthchecker: process.env.HEALTHCHECKER_URL || 'http://localhost:9884',
  startTimeout: process.env.SMOKE_START_TIMEOUT || 10000,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 60000,
  clientId: process.env.HYSTRIX_CLIENT_ID,
  clientSecret: process.env.HYSTRIX_CLIENT_SECRET,
  prefix: process.env.ABACUS_PREFIX || ''
};

const authentication = {
  auth: {
    user: testEnv.clientId,
    pass: testEnv.clientSecret,
    sendImmediately: true
  }
};

describe('abacus-healthchecker-smoke-test', () => {
  before((done) =>
    request.waitFor(`${testEnv.healthchecker}/v1/healthcheck`, authentication, testEnv.startTimeout, done)
  );

  const check = (alias, groups, done) => {
    request.get(`${testEnv.healthchecker}${alias}`, authentication, (err, response) => {
      debug('Healthchecker err %o, response %j', err, response);

      expect(err).to.be.undefined;
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.be.an('object').that.has.all.keys(groups);

      for(let appGroup of Object.keys(response.body)) {
        const appsResponses = Object.values(response.body[appGroup]);
        appsResponses.every((responseCode) => expect(responseCode, appGroup + ': ' + responseCode).to.equal(200));
      }
      done();
    });
  };


  it('reports the health of client facing components', function(done) {
    this.timeout(testEnv.totalTimeout + 2000);
    const testGroups = [
      `${testEnv.prefix}abacus-account-plugin`,
      `${testEnv.prefix}abacus-broker`,
      `${testEnv.prefix}abacus-provisioning-plugin`,
      `${testEnv.prefix}abacus-usage-collector`,
      `${testEnv.prefix}abacus-service-dashboard`,
      `${testEnv.prefix}abacus-usage-reporting`
    ];
    check('/v1/healthcheck', testGroups, done);
  });

  it('reports the health of internal components', function(done) {
    this.timeout(testEnv.totalTimeout + 2000);
    const testGroups = [
      `${testEnv.prefix}abacus-usage-meter`,
      `${testEnv.prefix}abacus-cf-renewer`,
      `${testEnv.prefix}abacus-usage-accumulator`,
      `${testEnv.prefix}abacus-usage-aggregator`,
      `${testEnv.prefix}abacus-eureka-plugin`,
      `${testEnv.prefix}abacus-housekeeper`,
      `${testEnv.prefix}abacus-applications-bridge`,
      `${testEnv.prefix}abacus-services-bridge`
    ];
    check('/v1/healthcheck/internal', testGroups, done);
  });
});
