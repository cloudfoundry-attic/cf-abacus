'use strict';

const { clone } = require('underscore');

const commander = require('commander');

const request = require('abacus-request');

// Setup the debug log
const debug = require('abacus-debug')('abacus-perf-test');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'perf');
commander
  .option('-t, --start-timeout <n>', 'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>', 'test timeout in milliseconds', parseInt)
  .option(
    '-h, --healthchecker <uri>',
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

  before((done) =>
    request.waitFor(`${healthchecker}/v1/healthcheck`, authentication, startTimeout, done)
  );

  it('reports the health of all components', function(done) {
    this.timeout(totalTimeout + 2000);

    request.get(`${healthchecker}/v1/healthcheck`, authentication, (err, response) => {
      debug('Healthchecker err %o, response %j', err, response);

      /* eslint-disable no-unused-expressions */
      expect(err).to.be.undefined;
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.be.an('object').that.has.all.keys(
        'collector',
        'meter',
        'accumulator',
        'aggregator',
        'reporting',
        'account',
        'provisioning',
        'eureka',
        'auth_server'
      );

      for(let appGroup of Object.keys(response.body)) {
        const appsResponses = Object.values(response.body[appGroup]);
        appsResponses.every((responseCode) => expect(responseCode).to.equal(200));
      }

      done();
    });
  });

});
