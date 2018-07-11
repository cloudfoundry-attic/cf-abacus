'use strict';

const generator = require('../../../lib/middleware/inflight/resource-provider-key-generator');
const scopes = require('../../../lib/middleware/inflight/scopes');

describe('resource-provider-key-generator tests', () => {

  const testReadClientScope = 'test-read-client-scope';
  const testWriteClientScope = 'test-write-client-scope';

  let req;
  let secured;

  const setupRequest = (readResourceScope, writeResourceScope, hasSystemReadScope, hasSystemWriteScope) => ({
    context: {
      oauth: {
        scopes: {
          readResourceScopes: [readResourceScope],
          writeResourceScopes: [writeResourceScope],
          hasSystemReadScope: hasSystemReadScope,
          hasSystemWriteScope: hasSystemWriteScope
        }
      }
    }
  });

  context('when secured', () => {

    beforeEach(() => {
      secured = true;
    });

    context('when request has read scope', () => {
      beforeEach(() => {
        req = setupRequest(testReadClientScope, undefined, false, false);
      });

      it('key should be read scope', () => {
        expect(generator(req, secured)).to.equal(testReadClientScope);
      });
    });

    context('when request has context, but no read scope', () => {
      beforeEach(() => {
        req = setupRequest(undefined, testWriteClientScope, false, false);
      });

      it('key should be write scope', () => {
        expect(generator(req, secured)).to.equal(testWriteClientScope);
      });
    });

    context('when request has read and write system scopes', () => {
      beforeEach(() => {
        req = setupRequest(undefined, undefined, true, true);
      });

      it('key should be system scope', () => {
        expect(generator(req, secured)).to.equal(scopes.SYSTEM);
      });
    });

    context('when request has write system scopes', () => {
      beforeEach(() => {
        req = setupRequest(undefined, undefined, false, true);
      });

      it('key should be system scope', () => {
        expect(generator(req, secured)).to.equal(scopes.SYSTEM);
      });
    });

    context('when request has no system or client scopes', () => {
      beforeEach(() => {
        req = setupRequest(undefined, undefined, false, false);
      });

      it('key should be system scope', () => {
        expect(generator(req, secured)).to.equal(scopes.UNKNOWN);
      });
    });


  });

  context('when not secured', () => {

    beforeEach(() => {
      secured = false;
    });

    context('when request has no scopes', () => {
      beforeEach(() => {
        req = {};
      });

      it('key should be unsecured', () => {
        expect(generator(req, secured)).to.equal(scopes.UNSECURED);
      });
    });
  });
});
