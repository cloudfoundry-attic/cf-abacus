'use strict';

class VoidAuthHeaderProvider {

  async getHeader() {
    return undefined;
  }
}

module.exports = {
  VoidAuthHeaderProvider
};
