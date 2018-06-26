'use strict';

/* eslint-disable no-unused-expressions */

const { clone } = require('underscore');
const commander = require('commander');

const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-extensions-healthchecker-test');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'perf');
commander
  .option('-t, --start-timeout <n>', 'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>', 'test timeout in milliseconds', parseInt)
  .option(
    '-c, --healthchecker <uri>',
    'healthchecker URL or domain name [http://localhost:9884]',
    'http://localhost:9884'
  )
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// Healthchecker URL
const healthchecker = commander.healthchecker;

const authentication = {
  auth: {
    user: process.env.CLIENT_ID,
    pass: process.env.CLIENT_SECRET,
    sendImmediately: true
  }
};

describe('abacus-extensions-healthchecker-test', () => {
  const prefix = process.env.ABACUS_PREFIX || '';

  before((done) =>
    request.waitFor(`${healthchecker}/v1/healthcheck`, authentication, startTimeout, done)
  );

  it('reports the health of client facing components', function(done) {
    this.timeout(totalTimeout + 2000);

    request.get(`${healthchecker}/v1/healthcheck`, authentication, (err, response) => {
      debug('Healthchecker err %o, response %j', err, response);

      expect(err).to.be.undefined;
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.be.an('object').that.has.all.keys(
        `${prefix}abacus-account-plugin`,
        `${prefix}abacus-broker`,
        `${prefix}abacus-provisioning-plugin`,
        `${prefix}abacus-usage-collector`,
        `${prefix}abacus-service-dashboard`,
        `${prefix}abacus-usage-reporting`
      );

      for(let appGroup of Object.keys(response.body)) {
        const appsResponses = Object.values(response.body[appGroup]);
        appsResponses.every((responseCode) => expect(responseCode).to.equal(200));
      }

      done();
    });
  });

  it('reports the health of internal components', function(done) {
    this.timeout(totalTimeout + 2000);

    request.get(`${healthchecker}/v1/healthcheck/internal`, authentication, (err, response) => {
      debug('Healthchecker err %o, response %j', err, response);

      expect(err).to.be.undefined;
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.be.an('object').that.has.all.keys(
        `${prefix}abacus-usage-meter`,
        `${prefix}abacus-cf-renewer`,
        `${prefix}abacus-usage-accumulator`,
        `${prefix}abacus-usage-aggregator`,
        `${prefix}abacus-eureka-plugin`,
        `${prefix}abacus-housekeeper`,
        `${prefix}abacus-applications-bridge`,
        `${prefix}abacus-services-bridge`
      );

      for(let appGroup of Object.keys(response.body)) {
        const appsResponses = Object.values(response.body[appGroup]);
        appsResponses.every((responseCode) => expect(responseCode).to.equal(200));
      }

      done();
    });
  });
});
