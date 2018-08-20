'use strict';

const { createCollectorConfiguration } = require('../lib/config');

describe('config tests', () => {
  const genericConfig = { someProp: 'someVal' };

  let sandbox;
  let envReaderFake;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    envReaderFake = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when env reader provides values', () => {
    it('should provide expected configuration' , () => {
      const expectedUnsupported = ['unsupported1', 'unsupported2'];
      envReaderFake.withArgs('UNSUPPORTED_LICENSES').returns('unsupported1,unsupported2');

      const config = createCollectorConfiguration(genericConfig, envReaderFake);
      
      expect(config.someProp).to.be.equal(genericConfig.someProp);
      expect(config.unsupportedLicenses).to.deep.equal(expectedUnsupported);
    });
  });

  context('when env reader does not provide values', () => {
    it('should provide default configuration' , () => {
      const config = createCollectorConfiguration(genericConfig, envReaderFake);

      expect(config.someProp).to.be.equal(genericConfig.someProp);
      expect(config.unsupportedLicenses).to.deep.equal([]);
    });
  });

});
