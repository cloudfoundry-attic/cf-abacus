'use strict';

const { bind } = require('underscore');
const { carryOverDb, createTokenFactory } = require('abacus-test-helper');
const { WebAppClient, BasicAuthHeaderProvider } = require('abacus-api');

const healthcheckScopes = ['abacus.system.read'];
let fixture;

const build = () => {

  const healthcheckerToken = () => {
    const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
    return tokenFactory.create(healthcheckScopes);
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
    });

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('when authorization is provided', () => {
      const credentials = {
        username: 'user',
        password: 'pass'
      };

      it('returns correct response', async () => {
        const webappClient = new WebAppClient(`http://localhost:${fixture.bridge.port}`, {
          authHeaderProvider: new BasicAuthHeaderProvider(credentials)
        });

        const health = await eventually(bind(webappClient.getHealth, webappClient));
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
          clientId: credentials.username,
          secret: credentials.password
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
