'use strict';

const { extend, omit } = require('underscore');

const threeMinutesInMs = 180000;
const twentySevenMinutesInMs = 1620000;

const fromEnv = {
  db: {
    alias: process.env.DBALIAS,
    partitions: process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : undefined
  },
  rabbitMQ: {
    mainQueue: {
      name: process.env.ABACUS_COLLECT_QUEUE,
      exchange: process.env.MAIN_EXCHANGE,
      prefetchLimit: process.env.PREFETCH_LIMIT ? parseInt(process.env.PREFETCH_LIMIT) : undefined
    },
    deadLetterQueues: [{
      name: process.env.FIRST_DL_NAME,
      exchange: process.env.FIRST_DL_EXCHANGE,
      ttl: process.env.FIRST_DL_TTL ? parseInt(process.env.FIRST_DL_TTL) : undefined,
      retryAttempts: process.env.FIRST_DL_RETRIES ? parseInt(process.env.FIRST_DL_RETRIES) : undefined
    }, {
      name: process.env.SECOND_DL_NAME,
      exchange: process.env.SECOND_DL_EXCHANGE,
      ttl: process.env.SECOND_DL_TTL ? parseInt(process.env.SECOND_DL_TTL) : undefined,
      retryAttempts: process.env.SECOND_DL_RETRIES ? parseInt(process.env.SECOND_DL_RETRIES) : undefined
    }]
  }
};

module.exports.createMeterConfiguration = (basicConfig) => {
  // 100 retries on first DL queue = 5 hours
  // 150 retries on second DL queue = 2 days 19 hours 30 minutes
  // total: 3 days 30 minutes
  /* eslint complexity: [1, 15] */
  const config = {
    db: {
      partitions: fromEnv.db.partitions || 6,
      alias: fromEnv.db.alias || 'db'
    },
    rabbitMQ: {
      mainQueue: {
        exchange: fromEnv.rabbitMQ.mainQueue.exchange || 'main-queue-exchange',
        routingKey: '#',
        prefetchLimit: fromEnv.rabbitMQ.mainQueue.prefetchLimit || 6
      },
      deadLetterQueues: [{
        name: fromEnv.rabbitMQ.deadLetterQueues[0].name || 'first-dl-queue',
        exchange: fromEnv.rabbitMQ.deadLetterQueues[0].exchange || 'first-dl-exchange',
        mainExchange: fromEnv.rabbitMQ.mainQueue.exchange || 'main-queue-exchange',
        routingKey: '#',
        ttl: fromEnv.rabbitMQ.deadLetterQueues[0].ttl || threeMinutesInMs,
        retryAttempts: fromEnv.rabbitMQ.deadLetterQueues[0].retryAttempts || 100 },
      {
        name: fromEnv.rabbitMQ.deadLetterQueues[1].name || 'second-dl-queue',
        exchange: fromEnv.rabbitMQ.deadLetterQueues[1].exchange || 'second-dl-exchange',
        mainExchange: fromEnv.rabbitMQ.mainQueue.exchange || 'main-queue-exchange',
        routingKey: '#',
        ttl: fromEnv.rabbitMQ.deadLetterQueues[1].ttl || twentySevenMinutesInMs,
        retryAttempts: fromEnv.rabbitMQ.deadLetterQueues[1].retryAttempts || 150
      }]
    }
  };
  config.rabbitMQ.mainQueue.name = basicConfig.collectQueue;
  config.rabbitMQ.uri = basicConfig.rabbitUris;

  return extend({}, config, omit(basicConfig, ['collectQueue', 'rabbitUris']));
};
