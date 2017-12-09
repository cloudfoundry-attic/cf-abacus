// Easy rewire and patch CommonJS modules for testing

const rewire = require('..');

describe('abacus-rewire', () => {
  it('rewires CommonJS modules', () => {
    // Rewire and patch the underscore module
    rewire('underscore', {
      default: () => 'mockDefault',
      map: () => 'mockMap'
    });

    const underscore = require('underscore');
    expect(underscore()).to.equal('mockDefault');
    expect(underscore.map()).to.equal('mockMap');
    expect(underscore.first([2, 3])).to.equal(2);
  });
});
