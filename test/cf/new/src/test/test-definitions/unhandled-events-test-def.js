'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const yieldable = require('abacus-yieldable');

const request = require('abacus-request');

const carryOverDb = require('./../lib/carry-over-db');
const createTokenFactory = require('./../lib/token-factory');
const wait = require('./../lib/wait');

let fixture;
let customBefore = () => {};
let createUnhandleableEvents;

const build = () => {

  context('when reading unhandleable events from Cloud Controller', () => {
    let externalSystemsMocks;
    let unhandleableEvents;

    before((done) => {
      externalSystemsMocks = fixture.getExternalSystemsMocks();
      externalSystemsMocks.startAll();

      customBefore(fixture);

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.defaults.oauth.abacusCollectorScopes)
        .return(fixture.defaults.oauth.abacusCollectorToken);

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.defaults.oauth.cfAdminScopes)
        .return(fixture.defaults.oauth.cfAdminToken);

      unhandleableEvents = createUnhandleableEvents(fixture);
      externalSystemsMocks
        .cloudController
        .usageEvents
        .return
        .firstTime(unhandleableEvents);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start(externalSystemsMocks);

      wait.until(() => {
        return externalSystemsMocks.cloudController.usageEvents.requestsCount() >= 2;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    it('expect abacus collector receive NO usage', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(0);
    });

    it('expect carry-over is empty', (done) => yieldable.functioncb(function *() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    })((err) => {
      done(err);
    }));

    it('expect skipped statistics are returned', (done) => {
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
            all: unhandleableEvents.length,
            conflicts: 0,
            skips: unhandleableEvents.length
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
  before: (value) => {
    customBefore = value;
    return testDef;
  },
  unhandleableEvents: (value) => {
    createUnhandleableEvents = value;
    return testDef;
  },
  build
};

module.exports = testDef;
