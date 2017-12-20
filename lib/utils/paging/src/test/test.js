'use strict';

describe('paging', () => {
  it('exposes item-iterator module', () => {
    expect(require('..').itemIterator).equals(require('../item-iterator'));
  });
  it('exposes page-iterator module', () => {
    expect(require('..').pageIterator).equals(require('../page-iterator'));
  });
});
