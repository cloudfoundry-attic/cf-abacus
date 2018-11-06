'use strict';

describe('mocha-fgrep', () => {
  it('this test contains regexp in description: /^@slow/', () => {
    throw new Error('Should not be executed');
  });

  it('this test is supposed to be @fast', (done) => {
    done();
  });
});
