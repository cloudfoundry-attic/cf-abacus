'use strict';

const { envReader } = require('./../lib/env-reader');

describe('env reader tests', () => {
  const testVar = 'TEST_VAR';

  beforeEach(() => {
    delete process.env[testVar];
  });

  describe('readString', () => {

    context('when env variable is exported', () => {

      it('should return the value', () => {
        const expectedValue = 'test-var-value';
        process.env[testVar] = expectedValue;

        const value = envReader.readString(testVar);

        expect(value).to.be.equal(expectedValue);
      });
    });

    context('when env variable is not exported', () => {

      context('when env default value is not provided', () => {
        it('should return undefined', () => {
          const value = envReader.readString(testVar);
          expect(value).to.be.equal(undefined);
        });
      });

      context('when env default value is provided', () => {
        it('should return the default value', () => {
          const defaultValue = 'DEFAULT';
          const value = envReader.readString(testVar, defaultValue);

          expect(value).to.be.equal(defaultValue);
        });
      });
    });
  });

  describe('readInt', () => {

    context('when env variable is exported', () => {

      it('should return the value', () => {
        process.env[testVar] = '1';
        const value = envReader.readInt(testVar);
        expect(value).to.be.equal(1);
      });
    });

    context('when env variable is not exported', () => {

      context('when env default value is not provided', () => {
        it('should return undefined', () => {
          const value = envReader.readInt(testVar);
          expect(value).to.be.equal(undefined);
        });
      });

      context('when env default value is provided', () => {
        it('should return the default value', () => {
          const defaultValue = 1;
          const value = envReader.readInt(testVar, defaultValue);

          expect(value).to.be.equal(defaultValue);
        });
      });
    });

  });

  describe('readArray', () => {

    context('when env variable is exported', () => {

      it('should return the value', () => {
        process.env[testVar] = 'a,b,c';
        const value = envReader.readArray(testVar);
        expect(value).to.deep.equal(['a','b','c']);
      });
    });

    context('when env variable is not exported', () => {

      context('when env default value is not provided', () => {
        it('should return undefined', () => {
          const value = envReader.readArray(testVar);
          expect(value).to.be.equal(undefined);
        });
      });

      context('when env default value is provided', () => {
        it('should return the default value', () => {
          const defaultValue = ['a','b','c'];
          const value = envReader.readArray(testVar, defaultValue);

          expect(value).to.be.equal(defaultValue);
        });
      });
    });

  });

});
