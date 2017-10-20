'use strict';

const oauth = require('abacus-oauth');
const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const retrieveToken = require('../token-retriever');

describe('token-retriever', () => {
  const sandbox = sinon.sandbox.create();

  const authServerURI = 'https://localhost:9014';
  const clientId = 'fake-client-id';
  const clientSecret = 'fake-client-secret';

  let oauthCacheStub;
  let token;
  let tokenStartStub;
  let retrievedToken;

  beforeEach(() => {
    tokenStartStub = sandbox.stub();
    token = {
      start: tokenStartStub
    };

    oauthCacheStub = sandbox.stub(oauth, 'cache');
    oauthCacheStub.returns(token);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when token start succeeds', () => {
    beforeEach(() => {
      tokenStartStub.yields();
    });

    context('when token without scopes is retrieved', () => {
      beforeEach(functioncb(function *() {
        retrievedToken = yield retrieveToken({
          authServerURI,
          clientId,
          clientSecret
        });
      }));

      it('returns the correct token', () => {
        expect(retrievedToken).to.equal(token);
      });

      it('starts the token', () => {
        assert.calledOnce(tokenStartStub);
      });

      it('retrieves the token via oauth package', () => {
        assert.calledOnce(oauthCacheStub);
        assert.calledWithExactly(oauthCacheStub,
          authServerURI, clientId, clientSecret, undefined);
      });
    });

    context('when token with scopes is retrieved', () => {
      const firstScope = 'first';
      const secondScope = 'second';

      beforeEach(functioncb(function *() {
        retrievedToken = yield retrieveToken({
          authServerURI,
          clientId,
          clientSecret,
          scopes: [firstScope, secondScope]
        });
      }));

      it('returns the correct token', () => {
        expect(retrievedToken).to.equal(token);
      });

      it('starts the token', () => {
        assert.calledOnce(tokenStartStub);
      });

      it('retrieves the token via oauth package', () => {
        assert.calledOnce(oauthCacheStub);
        assert.calledWithExactly(oauthCacheStub,
          authServerURI,
          clientId,
          clientSecret,
          `${firstScope} ${secondScope}`
        );
      });
    });
  });

  context('when token start fails', () => {
    beforeEach(() => {
      tokenStartStub
        .onFirstCall().yields(new Error('Failed to start'))
        .onSecondCall().yields();
    });

    context('when token is retrieved', () => {
      beforeEach(functioncb(function *() {
        retrievedToken = yield retrieveToken({
          authServerURI,
          clientId,
          clientSecret
        });
      }));

      it('returns the correct token', () => {
        expect(retrievedToken).to.equal(token);
      });

      it('starts the token by retrying', () => {
        assert.calledTwice(tokenStartStub);
      });
    });
  });
});
