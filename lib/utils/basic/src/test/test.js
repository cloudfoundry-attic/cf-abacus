'use strict';

describe('basic', () => {
  it('exposes credentials module', () => {
    expect(require('..').credentials).equals(require('../credentials'));
  });
  it('exposes check module', () => {
    expect(require('..').check).equals(require('../check'));
  });
});
