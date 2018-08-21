'use strict';

const { createCollectorConfiguration } = require('../lib/config');

describe('config tests', () => {
  const genericConfig = { someProp: 'someVal' };

  let sandbox;
  let envReaderStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    const readArrayStub = sandbox.stub();
    envReaderStub = {
      readArray: readArrayStub
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when env reader provides values', () => {
    it('should provide expected configuration' , () => {
      const expectedUnsupported = ['unsupported1', 'unsupported2'];
      envReaderStub.readArray.withArgs('UNSUPPORTED_LICENSES').returns(['unsupported1' ,'unsupported2']);

      const config = createCollectorConfiguration(genericConfig, envReaderStub);

      expect(config.someProp).to.be.equal(genericConfig.someProp);
      expect(config.unsupportedLicenses).to.deep.equal(expectedUnsupported);
    });
  });


});
