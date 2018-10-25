'use strict';

const util = require('util');
const oauth = require('abacus-oauth');
const { HeaderCreationError } = require('./header-creation-error');

class BearerAuthHeaderProvider {

  constructor({ uaaUrl, clientId, clientSecret, scopes }) {
    this.systemToken = oauth.cache(uaaUrl, clientId, clientSecret, scopes);
    this.tokenStarted = false;
  }

  async getHeader() {
    if (!this.tokenStarted) {
      const startToken = util.promisify(this.systemToken.start);
      await startToken();
      this.tokenStarted = true;
    }

    const header = this.systemToken();
    if (!header)
      throw new HeaderCreationError();

    return header;
  }
}


module.exports = {
  BearerAuthHeaderProvider
};

