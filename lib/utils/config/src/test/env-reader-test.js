'use strict';

const { envReader } = require('./../lib/env-reader'); 

describe('env reader tests', () => {
  const testVar = 'TEST_VAR';

  beforeEach(() => {
    delete process.env[testVar];
  });

  context('when env variable is exported', () => {
    
    it('should return the env variable value', () => {
      const expectedValue = 'test-var-value';
      process.env[testVar] = expectedValue;

      const value = envReader(testVar);

      expect(value).to.be.equal(expectedValue);
    });
  });

  context('when env variable is not exported', () => {
    
    it('should return undefined', () => {
      const value = envReader(testVar);

      expect(value).to.be.equal(undefined);
    });
  });
});
