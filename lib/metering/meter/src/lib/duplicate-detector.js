'use strict';

class DuplicateDetector {
  constructor(outputDbClient, dedupe) {
    this.outputDbClient = outputDbClient;
    this.cache = dedupe();
  }

  async isDuplicate(usageDoc) {
    const id = this.outputDbClient.buildId(usageDoc);
    if (this.cache.has(id))
      return true;
    if (await this.outputDbClient.get(id)) {
      this.cache.add(id);
      return true;
    }
    return false;
  }
}

module.exports = DuplicateDetector;
