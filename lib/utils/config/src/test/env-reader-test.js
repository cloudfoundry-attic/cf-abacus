'use strict';

const { envReader } = require('./../lib/env-reader'); 

describe('env reader tests', () => {
  context('when env variable is exported', () => {
    it('should return the env variable value', () => {
      const expectedValue = 'test-var-value';
      process.env.TEST_VAR = expectedValue;

      const value = envReader('TEST_VAR');
      delete process.env.TEST_VAR;
      
      expect(value).to.be.equal(expectedValue);
    });
  });

  context('when env variable is not exported', () => {
    it('should return undefined', () => {
      const value = envReader('TEST_VAR');

      expect(value).to.be.equal(undefined);
    });
  });
});
