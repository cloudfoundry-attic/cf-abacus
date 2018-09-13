'use strict';

const httpStatus = require('http-status-codes');

const { yieldable, functioncb } = require('abacus-yieldable');
const createWait = require('abacus-wait');

const carryOverDb = require('../../utils/carry-over-db');
const createTokenFactory = require('../../utils/token-factory');

const waitUntil = yieldable(createWait().until);
const healthcheckScopes = ['abacus.system.read'];

let fixture;

const build = () => {

  const healthcheckerToken = () => {
    const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
    return tokenFactory.create(healthcheckScopes);
  };

  context('when requesting healthcheck', () => {
    let externalSystemsMocks;

    before(functioncb(function*() {
      externalSystemsMocks = fixture.externalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.oauth.abacusCollectorScopes)
        .return(fixture.oauth.abacusCollectorToken);

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.oauth.cfAdminScopes)
        .return(fixture.oauth.cfAdminToken);

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(healthcheckScopes)
        .return(healthcheckerToken());

      yield carryOverDb.setup();
      fixture.bridge.start(externalSystemsMocks);

      yield waitUntil(fixture.bridge.healthcheck.isEndpointAvailable);
    })
    );

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('when authorization is provided', () => {
      const user = 'user';
      const password = 'password';
      let response;

      before(functioncb(function*() {
        response = yield fixture.bridge.healthcheck.isHealthy({
          user,
          password
        });
      }));

      after(() => {
        externalSystemsMocks.uaaServer.tokenService.clear();
      });

      it('returns correct response', functioncb(function*() {
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body).to.deep.equal({
          healthy: true
        });
      }));

      it('UAA is called properly', functioncb(function*() {
        const uaaRequests = externalSystemsMocks.uaaServer.tokenService
          .requests
          .withScopes(healthcheckScopes);
        expect(uaaRequests.length).to.equal(1);
        expect(uaaRequests[0].credentials).to.deep.equal({
          clientId: user,
          secret: password
        });
      }));
    });

    context('when authorization is missing', () => {
      let response;

      before(functioncb(function*() {
        response = yield fixture.bridge.healthcheck.isHealthy();
      }));

      after(() => {
        externalSystemsMocks.uaaServer.tokenService.clear();
      });

      it('UNAUTHORIZED is returned', yieldable.functioncb(function*() {
        expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
        expect(response.body).to.deep.equal(undefined);
      }));

      it('UAA is not called', yieldable.functioncb(function*() {
        const uaaRequests = externalSystemsMocks.uaaServer.tokenService
          .requests
          .withScopes(['abacus.system.read']);
        expect(uaaRequests.length).to.equal(0);
      }));
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
