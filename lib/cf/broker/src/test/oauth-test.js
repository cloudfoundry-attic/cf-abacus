'use strict';

const abacusOauth = require('abacus-oauth');

const reloadOauthModule = () => {
  delete require.cache[require.resolve('../auth/oauth.js')];
  return require('../auth/oauth.js');
};

describe('Oauth', () => {
  const sandbox = sinon.sandbox.create();

  const wrapperStub = sandbox.stub();
  wrapperStub.start = sandbox.stub();
  const oauthStub = sandbox.stub(abacusOauth, 'cache');

  const client = 'client';
  const secret = 'secret';

  let oauth;

  after(() => sandbox.restore());

  afterEach(() => sandbox.reset());

  context('when all credentials are provided', () => {
    const scopes = 'scope1 scope2';
    const token1 = 'Bearer AAA';
    const token2 = 'Bearer BBB';

    before(() => {
      process.env.SERVICE_BROKER_CLIENT_ID = client;
      process.env.SERVICE_BROKER_CLIENT_SECRET = secret;
      process.env.SERVICE_BROKER_CLIENT_SCOPES = scopes;

      oauthStub.returns(wrapperStub);
      oauth = reloadOauthModule();
    });

    it('should call abacus oauth with the corresponding arguments', () => {
      expect(oauthStub.callCount).to.equal(2);
      assert.calledWith(oauthStub, sinon.match.any, client, secret, scopes);
      assert.calledWith(oauthStub, sinon.match.any, client, secret,
        'clients.admin');
    });

    it('should return authorization headers', (done) => {
      wrapperStub.start.yields();
      wrapperStub.onFirstCall().returns(token1);
      wrapperStub.onSecondCall().returns(token2);

      oauth.init((err) => {
        expect(err).to.equal(undefined);
        expect(oauth.authHeader(oauth.SYSTEM_TOKEN))
          .to.eql({ authorization: token1 });
        expect(oauth.authHeader(oauth.CLIENT_REGISTRATION_TOKEN))
          .to.eql({ authorization: token2 });
        done();
      });
    });

    it('should return system token by default', (done) => {
      wrapperStub.start.yields();
      wrapperStub.onFirstCall().returns(token1);

      oauth.init((err) => {
        expect(err).to.equal(undefined);
        expect(oauth.authHeader()).to.eql({ authorization: token1 });
        done();
      });
    });

    it('should throw with invalid token identifier', (done) => {
      wrapperStub.start.yields();

      oauth.init((err) => {
        expect(err).to.equal(undefined);
        expect(() => oauth.authHeader('INVALID')).to.throw();
        done();
      });
    });

    it('should proxy the actual error from oauth', (done) => {
      const errorMessage = 'some_error';
      wrapperStub.start.yields(new Error(errorMessage));

      oauth.init((err) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal(errorMessage);
        done();
      });
    });
  });

  context('when scopes are missing from the environment', () => {
    it('should request the default ones', () => {
      process.env.SERVICE_BROKER_CLIENT_ID = client;
      process.env.SERVICE_BROKER_CLIENT_SECRET = secret;
      delete process.env.SERVICE_BROKER_CLIENT_SCOPES;

      reloadOauthModule();

      assert.calledWith(oauthStub, sinon.match.any,
        client, secret, 'clients.admin');
      assert.calledWith(oauthStub, sinon.match.any,
        client, secret, 'abacus.usage.read abacus.usage.write');
    });
  });
});
