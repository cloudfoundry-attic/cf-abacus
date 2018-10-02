'use strict';

/* eslint-disable no-unused-expressions */

const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-healthchecker-smoke-test');

const abacusPrefix = process.env.ABACUS_PREFIX || '';

const testEnv = {
  healthchecker: process.env.HEALTHCHECKER_URL || 'http://localhost:9884',
  startTimeout: process.env.SMOKE_START_TIMEOUT || 10000,
  totalTimeout: process.env.SMOKE_TOTAL_TIMEOUT || 60000,
  clientId: process.env.HYSTRIX_CLIENT_ID,
  clientSecret: process.env.HYSTRIX_CLIENT_SECRET,
  prefix: abacusPrefix,
  clientFacingComponents: process.env.CLIENT_FACING_COMPONENTS || [
    `${abacusPrefix}abacus-account-plugin`,
    `${abacusPrefix}abacus-broker`,
    `${abacusPrefix}abacus-provisioning-plugin`,
    `${abacusPrefix}abacus-usage-collector`,
    `${abacusPrefix}abacus-service-dashboard`,
    `${abacusPrefix}abacus-usage-reporting`
  ],
  internalComponents: process.env.INTERNAL_COMPONENTS || [
    `${abacusPrefix}abacus-usage-meter`,
    `${abacusPrefix}abacus-cf-renewer`,
    `${abacusPrefix}abacus-usage-accumulator`,
    `${abacusPrefix}abacus-usage-aggregator`,
    `${abacusPrefix}abacus-eureka-plugin`,
    `${abacusPrefix}abacus-housekeeper`,
    `${abacusPrefix}abacus-applications-bridge`,
    `${abacusPrefix}abacus-services-bridge`
  ]
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
    check('/v1/healthcheck', testEnv.clientFacingComponents, done);
  });

  it('reports the health of internal components', function(done) {
    this.timeout(testEnv.totalTimeout + 2000);
    check('/v1/healthcheck/internal', testEnv.internalComponents, done);
  });
});
