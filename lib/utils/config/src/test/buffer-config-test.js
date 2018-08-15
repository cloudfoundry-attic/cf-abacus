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
    getFromEnvFake = sandbox.stub().returns(sandbox.any);
    config = bufferConfig(getFromEnvFake);
    
    config.token();

    expect(getFromEnvFake.getCall(0).lastArg).to.be.equal('CLIENT_ID');
    expect(getFromEnvFake.getCall(1).lastArg).to.be.equal('CLIENT_SECRET');
  });

  context('when env reader provides values', () => {
    beforeEach(() => {
      getFromEnvFake = sandbox.stub().returns('value');
      config = bufferConfig(getFromEnvFake);
    });

    it('should read expected configurations', () => {
      expect(getFromEnvFake.getCall(0).lastArg).to.be.equal('CLIENT_ID');
      expect(getFromEnvFake.getCall(1).lastArg).to.be.equal('CLIENT_SECRET');
      expect(getFromEnvFake.getCall(2).lastArg).to.be.equal('SECURED');
      expect(getFromEnvFake.getCall(3).lastArg).to.be.equal('ABACUS_COLLECT_QUEUE');
      expect(getFromEnvFake.getCall(4).lastArg).to.be.equal('RABBIT_URI');
      expect(getFromEnvFake.getCall(5).lastArg).to.be.equal('RABBIT_URI');
      expect(getFromEnvFake.getCall(6).lastArg).to.be.equal('JWTKEY');
      expect(getFromEnvFake.getCall(7).lastArg).to.be.equal('JWTALGO');
    });
  });

  context('when env reader does not provide values', () => {
    beforeEach(() => {
      getFromEnvFake = sandbox.stub().returns(undefined);
      config = bufferConfig(getFromEnvFake);
    });
    
    it('should read expected configurations', () => {
      expect(getFromEnvFake.getCall(0).lastArg).to.be.equal('CLIENT_ID');
      expect(getFromEnvFake.getCall(1).lastArg).to.be.equal('CLIENT_SECRET');
      expect(getFromEnvFake.getCall(2).lastArg).to.be.equal('SECURED');
      expect(getFromEnvFake.getCall(3).lastArg).to.be.equal('ABACUS_COLLECT_QUEUE');
      expect(getFromEnvFake.getCall(4).lastArg).to.be.equal('RABBIT_URI');
      expect(getFromEnvFake.getCall(5).lastArg).to.be.equal('RABBIT_SERVICE_NAME');
      expect(getFromEnvFake.getCall(6).lastArg).to.be.equal('JWTKEY');
      expect(getFromEnvFake.getCall(7).lastArg).to.be.equal('JWTALGO');
    });

    it('should provide default collect queue name', () => {  
      expect(config.collectQueue).to.be.equal('abacus-collect-queue');
    });
  });
});
