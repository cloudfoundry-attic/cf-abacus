'use strict';

const { bufferConfig } = require('../lib/buffer-config');

describe('buffer config tests', () => {
  let config;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when env reader provides values', () => {
    beforeEach(() => {
      const readStringStub = sandbox.stub();
      const readArrayStub = sandbox.stub();
      const envReaderStub = {
        readString: readStringStub,
        readArray: readArrayStub
      };
      readStringStub.withArgs('CLIENT_ID').returns('clientId');
      readStringStub.withArgs('CLIENT_SECRET').returns('clientSecret');
      readStringStub.withArgs('SECURED').returns('true');
      readStringStub.withArgs('ABACUS_COLLECT_QUEUE').returns('collectQueue');
      readStringStub.withArgs('JWTKEY').returns('jwtKey');
      readStringStub.withArgs('JWTALGO').returns('jwtAlgo');
      readArrayStub.withArgs('RABBIT_URI').returns(['rabbitUri']);

      config = bufferConfig(envReaderStub);
    });

    it('should provide values from env reader', () => {
      expect(config.clientId).to.be.equal('clientId');
      expect(config.clientSecret).to.be.equal('clientSecret');
      expect(config.secured).to.be.equal(true);
      expect(config.collectQueue).to.be.equal('collectQueue');
      expect(config.rabbitUris).to.deep.equal(['rabbitUri']);
      expect(config.jwtKey).to.be.equal('jwtKey');
      expect(config.jwtAlgo).to.be.equal('jwtAlgo');
    });
  });
});
