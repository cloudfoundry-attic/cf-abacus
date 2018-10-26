'use strict';

const abacusOAuthModule = stubModule('abacus-oauth');

const { BearerAuthHeaderProvider } = require('../../lib/auth-header-providers/bearer-auth-header-provider');
const { HeaderCreationError } = require('../../lib/auth-header-providers/header-creation-error');

describe('BearerAuthHeaderProvider', () => {
  let systemTokenStub;
  let authHeaderProvider;

  beforeEach(() => {
    const cacheStub = sinon.stub();
    abacusOAuthModule.stubProperties({
      cache: cacheStub
    });

    systemTokenStub = sinon.stub();
    systemTokenStub.start = sinon.stub().yields();
    cacheStub.returns(systemTokenStub);
    
    authHeaderProvider = new BearerAuthHeaderProvider({
      uaaUrl: 'url',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: 'scopes'
    });
  });

  context('when header is successfully acquired', () => {
    const headerContent = 'Bearer auth-header';

    beforeEach(() => {
      systemTokenStub.returns(headerContent);
    });

    it('it get returned', async () => {
      const actualHeader = await authHeaderProvider.getHeader(headerContent);
      expect(actualHeader).to.equals(headerContent);
    });
  });

  context('when header is requested twice', () => {
    const headerContent = 'Bearer auth-header';

    beforeEach(() => {
      systemTokenStub.returns(headerContent);
    });

    it('the token is started only once', async () => {
      await authHeaderProvider.getHeader(headerContent);
      await authHeaderProvider.getHeader(headerContent);
      assert.calledOnce(systemTokenStub.start);
    });
  });

  context('when token is not available', () => {
    beforeEach(() => {
      systemTokenStub.returns(undefined);
    });

    it('error is thrown', async () => {
      await expect(authHeaderProvider.getHeader()).to.be.rejectedWith(HeaderCreationError);
    });
  });
});
