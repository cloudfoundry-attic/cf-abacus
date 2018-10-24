'use strict';

const { carryOverDb, createTokenFactory } = require('abacus-test-helper');
const { UnauthorizedError } = require('abacus-api');

const healthcheckScopes = ['abacus.system.read'];
let fixture;

const build = () => {

  const healthcheckerToken = () => {
    const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
    return tokenFactory.create(healthcheckScopes);
  };

  const healthcheckEndpointIsAvailable = async () => {
    try {
      return await fixture.bridge.webappClient.getHealth();
    } catch (e) {
      if (!(e instanceof UnauthorizedError))
        throw e;

      return undefined;
    }
  };

  context('when requesting healthcheck', () => {
    let externalSystemsMocks;

    before(async () => {
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

      await carryOverDb.setup();
      fixture.bridge.start(externalSystemsMocks);

      await eventually(healthcheckEndpointIsAvailable);
    });

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('when authorization is provided', () => {
      const user = 'user';
      const password = 'password';
      let health;

      before(async () => {
        health = await fixture.bridge.webappClient.getHealth({
          username: user,
          password
        });
      });

      after(() => {
        externalSystemsMocks.uaaServer.tokenService.clear();
      });

      it('returns correct response', () => {
        expect(health).to.deep.equal({
          healthy: true
        });
      });

      it('UAA is called properly', () => {
        const uaaRequests = externalSystemsMocks.uaaServer.tokenService
          .requests
          .withScopes(healthcheckScopes);
        expect(uaaRequests.length).to.equal(1);
        expect(uaaRequests[0].credentials).to.deep.equal({
          clientId: user,
          secret: password
        });
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
