'use strict';

const { BasicAuthHeaderProvider } = require('../../lib/auth-header-providers/basic-auth-header-provider');
const { HeaderCreationError } = require('../../lib/auth-header-providers/header-creation-error');


describe('BasicAuthHeaderProvider', () => {

  context('when credentials are passed', () => {
    const username = 'user';
    const password = 'pass';

    let provider;

    before(() => {
      provider = new BasicAuthHeaderProvider({
        username,
        password
      });
    });

    it('returns Basic auth header', async () => {
      expect(await provider.getHeader())
        .to.be.equal(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
    });
  });

  const itInvalidCredentials = (credentials) =>
    it('throws an error', async () => {
      const provider = new BasicAuthHeaderProvider(credentials);
      await expect(provider.getHeader()).to.be.rejectedWith(HeaderCreationError);
    });

  context('when no credentials are passed', () => {
    itInvalidCredentials();
  });

  context('when no username is passed', () => {
    itInvalidCredentials({
      password: 'password'
    });
  });

  context('when no password is passed', () => {
    itInvalidCredentials({
      username: 'username'
    });
  });
});
