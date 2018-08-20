'use strict';

const { createMeterConfiguration } = require('../lib/config');

describe('config tests', () => {
  const genericConfig = { collectQueue: 'any', rabbitUris: ['one', 'two'] };

  let sandbox;
  let envReaderFake;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    envReaderFake = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when env reader provides env values', () => {
    it('should provide expected configuration', () => {
      envReaderFake.withArgs('DB_PARTITIONS').returns('4');
      envReaderFake.withArgs('DBALIAS').returns('dbAlias');
      envReaderFake.withArgs('MAIN_EXCHANGE').returns('mainExchange');
      envReaderFake.withArgs('PREFETCH_LIMIT').returns('5');
      envReaderFake.withArgs('FIRST_DL_NAME').returns('firstDlQueue');
      envReaderFake.withArgs('FIRST_DL_EXCHANGE').returns('firstDlExchange');
      envReaderFake.withArgs('FIRST_DL_TTL').returns('20');
      envReaderFake.withArgs('FIRST_DL_RETRIES').returns('10');
      envReaderFake.withArgs('SECOND_DL_NAME').returns('secondDlQueue');
      envReaderFake.withArgs('SECOND_DL_EXCHANGE').returns('secondDlExchange');
      envReaderFake.withArgs('SECOND_DL_TTL').returns('30');
      envReaderFake.withArgs('SECOND_DL_RETRIES').returns('7');

      const config = createMeterConfiguration(genericConfig, envReaderFake);

      expect(config.db.partitions).to.be.equal(4);
      expect(config.db.alias).to.be.equal('dbAlias');

      expect(config.rabbitMQ.mainQueue.name).to.be.equal('any');
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

      expect(config.rabbitMQ.uris).to.be.equal(genericConfig.rabbitUris[0]);
    });
  });

  context('when env reader does not provide env values', () => {
    it('should provide default configuration', () => {
      const config = createMeterConfiguration(genericConfig, envReaderFake);

      expect(config.db.partitions).to.be.equal(6);
      expect(config.db.alias).to.be.equal('db');
      
      expect(config.rabbitMQ.mainQueue.name).to.be.equal('any');
      expect(config.rabbitMQ.mainQueue.exchange).to.be.equal('main-queue-exchange');
      expect(config.rabbitMQ.mainQueue.routingKey).to.be.equal('#');
      expect(config.rabbitMQ.mainQueue.prefetchLimit).to.be.equal(6);

      expect(config.rabbitMQ.deadLetterQueues[0].name).to.be.equal('first-dl-queue');
      expect(config.rabbitMQ.deadLetterQueues[0].exchange).to.be.equal('first-dl-exchange');
      expect(config.rabbitMQ.deadLetterQueues[0].mainExchange).to.be.equal('main-queue-exchange');
      expect(config.rabbitMQ.deadLetterQueues[0].routingKey).to.be.equal('#');
      expect(config.rabbitMQ.deadLetterQueues[0].ttl).to.be.equal(180000);
      expect(config.rabbitMQ.deadLetterQueues[0].retryAttempts).to.be.equal(100);

      expect(config.rabbitMQ.deadLetterQueues[1].name).to.be.equal('second-dl-queue');
      expect(config.rabbitMQ.deadLetterQueues[1].exchange).to.be.equal('second-dl-exchange');
      expect(config.rabbitMQ.deadLetterQueues[1].mainExchange).to.be.equal('main-queue-exchange');
      expect(config.rabbitMQ.deadLetterQueues[1].routingKey).to.be.equal('#');
      expect(config.rabbitMQ.deadLetterQueues[1].ttl).to.be.equal(1620000);
      expect(config.rabbitMQ.deadLetterQueues[1].retryAttempts).to.be.equal(150);

      expect(config.rabbitMQ.uris).to.be.equal(genericConfig.rabbitUris[0]);
    });
  });
});
