'use strict';

const { HeaderCreationError } = require('./header-creation-error');

class BasicAuthHeaderProvider {

  constructor(credentials) {
    this.credentials = credentials;
  }
  
  async getHeader() {
    if (!this.credentials || !this.credentials.username || !this.credentials.password)
      throw new HeaderCreationError();
    
    return `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64')}`;
  }
}

module.exports = {
  BasicAuthHeaderProvider
};
