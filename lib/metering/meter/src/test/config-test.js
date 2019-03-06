'use strict';

const { createMeterConfiguration } = require('../lib/config');

describe('config tests', () => {
  const collectQueue = 'any';
  const rabbitUris = ['one', 'two'];
  const genericConfig = { collectQueue, rabbitUris };

  let sandbox;
  let envReaderStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    const readStringStub = sandbox.stub();
    const readIntStub = sandbox.stub();
    const readArrayStub = sandbox.stub();
    envReaderStub = {
      readString: readStringStub,
      readInt: readIntStub,
      readArray: readArrayStub
    };

    readIntStub.withArgs('DB_PARTITIONS').returns(4);
    readStringStub.withArgs('DBALIAS').returns('dbAlias');
    readStringStub.withArgs('MAIN_EXCHANGE').returns('mainExchange');
    readIntStub.withArgs('PREFETCH_LIMIT').returns(5);
    readStringStub.withArgs('FIRST_DL_NAME').returns('firstDlQueue');
    readStringStub.withArgs('FIRST_DL_EXCHANGE').returns('firstDlExchange');
    readIntStub.withArgs('FIRST_DL_TTL').returns(20);
    readIntStub.withArgs('FIRST_DL_RETRIES').returns(10);
    readStringStub.withArgs('SECOND_DL_NAME').returns('secondDlQueue');
    readStringStub.withArgs('SECOND_DL_EXCHANGE').returns('secondDlExchange');
    readIntStub.withArgs('SECOND_DL_TTL').returns(30);
    readIntStub.withArgs('SECOND_DL_RETRIES').returns(7);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when env reader provides env values', () => {
    it('should provide expected configuration', () => {
      const config = createMeterConfiguration(genericConfig, envReaderStub);

      expect(config.db.partitions).to.be.equal(4);
      expect(config.db.alias).to.be.equal('dbAlias');

      expect(config.rabbitMQ.mainQueue.name).to.be.equal(collectQueue);
      expect(config.rabbitMQ.mainQueue.exchange).to.be.equal('mainExchange');
      expect(config.rabbitMQ.mainQueue.routingKey).to.be.equal('#');
      expect(config.rabbitMQ.mainQueue.prefetchLimit).to.be.equal(5);

      expect(config.rabbitMQ.deadLetterQueues[0].name).to.be.equal('firstDlQueue');
      expect(config.rabbitMQ.deadLetterQueues[0].exchange).to.be.equal('firstDlExchange');
      expect(config.rabbitMQ.deadLetterQueues[0].mainExchange).to.be.equal('mainExchange');
      expect(config.rabbitMQ.deadLetterQueues[0].routingKey).to.be.equal('#');
      expect(config.rabbitMQ.deadLetterQueues[0].ttl).to.be.equal(20);
      expect(config.rabbitMQ.deadLetterQueues[0].retryAttempts).to.be.equal(10);

      expect(config.rabbitMQ.deadLetterQueues[1].name).to.be.equal('secondDlQueue');
      expect(config.rabbitMQ.deadLetterQueues[1].exchange).to.be.equal('secondDlExchange');
      expect(config.rabbitMQ.deadLetterQueues[1].mainExchange).to.be.equal('mainExchange');
      expect(config.rabbitMQ.deadLetterQueues[1].routingKey).to.be.equal('#');
      expect(config.rabbitMQ.deadLetterQueues[1].ttl).to.be.equal(30);
      expect(config.rabbitMQ.deadLetterQueues[1].retryAttempts).to.be.equal(7);

      expect(config.rabbitMQ.uris).to.be.equal(rabbitUris);
    });
  });

});
