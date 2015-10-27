'use strict';

// Populate the application environment with an rc file

const rc = require('..');

describe('abacus-rc', () => {
  it('Populates application environment from rc files', () => {

    // Load a test rc file
    // Normally you don't need to set this _config var, here this is
    // just to pick up our test rc file
    process.env.test_config = './src/test/.testrc';

    process.env.CONF = 'staging';
    rc('test');
    expect(process.env.FOO).to.equal('bar');
    expect(process.env.HEY).to.equal('there');
  });
});

