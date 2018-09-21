'use strict';

const { buildPath } = require('../lib/url');

describe('#buildPath', () => {
  it('builds an absolute path from segments', () => {
    const path = buildPath('a', 'b', 'c');
    expect(path).to.equal('/a/b/c');
  });

  it('encodes segments', () => {
    const path = buildPath('&', '$');
    expect(path).to.equal('/%26/%24');
  });
});
