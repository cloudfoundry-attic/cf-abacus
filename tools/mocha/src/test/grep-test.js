'use strict';

describe('mocha-grep', () => {
  it('this test is @failing', () => {
    throw new Error('Should not be executed as we ignored @failing tag in package.json');
  });

  it('this test should succeed', (done) => {
    done();
  });
});
