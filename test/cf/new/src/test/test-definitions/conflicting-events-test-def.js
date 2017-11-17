'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./utils/carry-over-db');
const createTokenFactory = require('./utils/token-factory');
const serviceMock = require('./utils/service-mock-util');
const wait = require('./utils/wait');

let fixture;

const build = () => {
  context('when send usage conflicts', () => {
    let externalSystemsMocks;

    before((done) => {
      externalSystemsMocks = fixture.getExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.oauth.abacusCollectorScopes)
        .return(fixture.oauth.abacusCollectorToken);

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.oauth.cfAdminScopes)
        .return(fixture.oauth.cfAdminToken);

      const serviceUsageEvent = fixture
        .usageEvent()
        .get();
      externalSystemsMocks.cloudController.usageEvents.return.firstTime([
        serviceUsageEvent
      ]);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CONFLICT);

      fixture.bridge.start(externalSystemsMocks);

      wait.until(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(2), done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });


    it('expect abacus collector received the conflicting usage', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(1);
    });

    it('expect carry-over is empty', (done) => yieldable.functioncb(function *() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    })((err) => {
      done(err);
    }));

    it('expect conflict statistics are returned', (done) => {
      const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
      const signedToken = tokenFactory.create(['abacus.usage.read']);
      request.get('http://localhost::port/v1/stats', {
        port: fixture.bridge.port,
        headers: {
          authorization: `Bearer ${signedToken}`
        }
      }, (error, response) => {
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body.statistics.usage).to.deep.equal({
          success : {
            all: 1,
            conflicts: 1,
            skips: 0
          },
          failures : 0
        });
        done();
      });
    });

  });

};


const testDef = {
  fixture: (value) => {
    fixture = value;
    return testDef;
  },
  build
};

module.exports = testDef;

