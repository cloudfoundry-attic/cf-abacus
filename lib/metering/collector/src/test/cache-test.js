'use strict';

const cache = require('../cache.js')();

/* eslint no-unused-expressions: 1 */

describe('cache', () => {
  it('should put and retrieve element from the cache', () => {
    const expectedElement = 'element';

    cache.cache(1, expectedElement);
    const actualElement = cache.find(1);

    expect(actualElement).to.be.equal(expectedElement);
  });
});
