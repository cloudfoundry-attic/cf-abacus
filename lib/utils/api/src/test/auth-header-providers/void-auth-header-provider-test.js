'use strict';

const { VoidAuthHeaderProvider } = require('../../lib/auth-header-providers/void-auth-header-provider');

describe('VoidAuthHeaderProvider', () => {

  context('when auth header is requested', () => {
        
    it('it returns "undefined"', async () => {
      const provider = new VoidAuthHeaderProvider();
      expect(await provider.getHeader()).to.equal(undefined);
    });
  });
});
