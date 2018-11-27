'use strict';

const abacusOauth = require('abacus-oauth');

const reloadOauthModule = () => {
  delete require.cache[require.resolve('../../auth/admin-token.js')];
  return require('../../auth/admin-token.js');
};

describe('Oauth', () => {
  const sandbox = sinon.createSandbox();

  const wrapperStub = sandbox.stub();
  wrapperStub.start = sandbox.stub();
  const oauthStub = sandbox.stub(abacusOauth, 'cache');

  const client = 'client';
  const secret = 'secret';

  let oauth;

  after(() => sandbox.restore());

  afterEach(() => sandbox.reset());

  context('when all credentials are provided', () => {
    const token1 = 'Bearer AAA';

    before(() => {
      process.env.SERVICE_BROKER_CLIENT_ID = client;
      process.env.SERVICE_BROKER_CLIENT_SECRET = secret;

      oauthStub.returns(wrapperStub);
      oauth = reloadOauthModule();
    });

    it('should call abacus oauth with the corresponding arguments', () => {
      expect(oauthStub.callCount).to.equal(1);
      assert.calledWith(oauthStub, sinon.match.any, client, secret, 'clients.admin');
    });

    it('should return authorization headers', (done) => {
      wrapperStub.start.yields();
      wrapperStub.onFirstCall().returns(token1);

      oauth.init((err) => {
        expect(err).to.equal(undefined);
        expect(oauth.authHeader()).to.eql({ authorization: token1 });
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

});
