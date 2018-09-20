'use strict';

/* eslint-disable no-unused-expressions */

const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-healthchecker-smoke-test');

const env = {
  healthchecker: process.env.HEALTHCHECKER_URL || 'http://localhost:9884',
  startTimeout: process.env.HEALTHCHECKER_START_TIMEOUT || 10000,
  totalTimeout: process.env.HEALTHCHECKER_TOTAL_TIMEOUT || 60000,
  clientId: process.env.HYSTRIX_CLIENT_ID,
  clientSecret: process.env.HYSTRIX_CLIENT_SECRET,
  prefix: process.env.ABACUS_PREFIX || ''
};

const authentication = {
  auth: {
    user: env.clientId,
    pass: env.clientSecret,
    sendImmediately: true
  }
};

describe('abacus-healthchecker-smoke-test', () => {
  before((done) =>
    request.waitFor(`${env.healthchecker}/v1/healthcheck`, authentication, env.startTimeout, done)
  );

  const check = (alias, groups, done) => {
    request.get(`${env.healthchecker}${alias}`, authentication, (err, response) => {
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
    this.timeout(env.totalTimeout + 2000);
    const testGroups = [
      `${env.prefix}abacus-account-plugin`,
      `${env.prefix}abacus-broker`,
      `${env.prefix}abacus-provisioning-plugin`,
      `${env.prefix}abacus-usage-collector`,
      `${env.prefix}abacus-service-dashboard`,
      `${env.prefix}abacus-usage-reporting`
    ];
    check('/v1/healthcheck', testGroups, done);
  });

  it('reports the health of internal components', function(done) {
    this.timeout(env.totalTimeout + 2000);
    const testGroups = [
      `${env.prefix}abacus-usage-meter`,
      `${env.prefix}abacus-cf-renewer`,
      `${env.prefix}abacus-usage-accumulator`,
      `${env.prefix}abacus-usage-aggregator`,
      `${env.prefix}abacus-eureka-plugin`,
      `${env.prefix}abacus-housekeeper`,
      `${env.prefix}abacus-applications-bridge`,
      `${env.prefix}abacus-services-bridge`
    ];
    check('/v1/healthcheck/internal', testGroups, done);
  });
});
