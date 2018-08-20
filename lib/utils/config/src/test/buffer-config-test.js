'use strict';

const { bufferConfig } = require('../lib/buffer-config');

describe('buffer config tests', () => {
  let config;
  let sandbox;
  let getFromEnvFake;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should export token function', () => {
    getFromEnvFake = sandbox.stub();
    config = bufferConfig(getFromEnvFake);
    
    config.token();

    expect(getFromEnvFake.getCall(0).lastArg).to.be.equal('CLIENT_ID');
    expect(getFromEnvFake.getCall(1).lastArg).to.be.equal('CLIENT_SECRET');
  });

  context('when env reader provides values', () => {
    beforeEach(() => {
      getFromEnvFake = sandbox.stub();
      getFromEnvFake.withArgs('CLIENT_ID').returns('clientId');
      getFromEnvFake.withArgs('CLIENT_SECRET').returns('clientSecret');
      getFromEnvFake.withArgs('SECURED').returns('true');
      getFromEnvFake.withArgs('ABACUS_COLLECT_QUEUE').returns('collectQueue');
      getFromEnvFake.withArgs('RABBIT_URI').returns('rabbitUri');
      getFromEnvFake.withArgs('JWTKEY').returns('jwtKey');
      getFromEnvFake.withArgs('JWTALGO').returns('jwtAlgo');

      config = bufferConfig(getFromEnvFake);
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

  context('when env reader does not provide values', () => {
    beforeEach(() => {
      getFromEnvFake = sandbox.stub();
      config = bufferConfig(getFromEnvFake);
    });

    it('should provide default collect queue name', () => {
      expect(config.collectQueue).to.be.equal('abacus-collect-queue');
      expect(config.rabbitUris).to.deep.equal([]);
      expect(config.secured).to.be.equal(false);
    });
  });
});
