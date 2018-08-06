'use strict';

const defaultDbConfig = {
  dbPartitions: 6
};

const threeMinutesInMs = 180000;
const twentySevenMinutesInMs = 1620000;

// 100 retries on first DL queue = 5 hours
// 150 retries on second DL queue = 2 days 19 hours 30 minutes
// total: 3 days 30 minutes
const defaultRabbitConfig = {
  mainQueue: {
    name: 'abacus-collect-queue',
    exchange: 'main-queue-exchange',
    routingKey: '#',
    prefetchLimit: 6
  },
  deadLetterQueues: [
    {
      name: 'first-dl-queue',
      exchange: 'first-dl-exchange',
      mainExchange: 'main-queue-exchange',
      routingKey: '#',
      ttl: threeMinutesInMs,
      retryAttempts: 100
    },
    {
      name: 'second-dl-queue',
      exchange: 'second-dl-exchange',
      mainExchange: 'main-queue-exchange',
      routingKey: '#',
      ttl: twentySevenMinutesInMs,
      retryAttempts: 150
    }
  ]
};

const fromEnv = {
  dbPartitions: process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : undefined,
  mainQueue: {
    name: process.env.ABACUS_COLLECT_QUEUE ? process.env.ABACUS_COLLECT_QUEUE : undefined,
    exchange: process.env.MAIN_EXCHANGE ? process.env.MAIN_EXCHANGE : undefined,
    prefetchLimit: process.env.PREFETCH_LIMIT ? parseInt(process.env.PREFETCH_LIMIT) : undefined
  },
  deadLetterQueues: [
    {
      name: process.env.FIRST_DL_NAME ? process.env.FIRST_DL_NAME : undefined,
      exchange: process.env.FIRST_DL_EXCHANGE ? process.env.FIRST_DL_EXCHANGE : undefined,
      ttl: process.env.FIRST_DL_TTL ? parseInt(process.env.FIRST_DL_TTL) : undefined,
      retryAttempts: process.env.FIRST_DL_RETRIES ? parseInt(process.env.FIRST_DL_RETRIES) : undefined
    },
    {
      name: process.env.SECOND_DL_NAME ? process.env.SECOND_DL_NAME : undefined,
      exchange: process.env.SECOND_DL_EXCHANGE ? process.env.SECOND_DL_EXCHANGE : undefined,
      ttl: process.env.SECOND_DL_TTL ? parseInt(process.env.SECOND_DL_TTL) : undefined,
      retryAttempts: process.env.SECOND_DL_RETRIES ? parseInt(process.env.SECOND_DL_RETRIES) : undefined
    }
  ]
};

module.exports.dbConfig = {
  dbPartitions: fromEnv.dbPartitions || defaultDbConfig.dbPartitions
};

/* eslint complexity: [1, 15] */
module.exports.rabbitMQConfig = {
  mainQueue: {
    name: fromEnv.mainQueue.name || defaultRabbitConfig.mainQueue.name,
    exchange: fromEnv.mainQueue.exchange || defaultRabbitConfig.mainQueue.exchange,
    routingKey: defaultRabbitConfig.mainQueue.routingKey,
    prefetchLimit: fromEnv.mainQueue.prefetchLimit || defaultRabbitConfig.mainQueue.prefetchLimit
  },
  deadLetterQueues: [{
    name: fromEnv.deadLetterQueues[0].name || defaultRabbitConfig.deadLetterQueues[0].name,
    exchange: fromEnv.deadLetterQueues[0].exchange || defaultRabbitConfig.deadLetterQueues[0].exchange,
    mainExchange: fromEnv.mainQueue.exchange || defaultRabbitConfig.mainQueue.exchange,
    routingKey: defaultRabbitConfig.deadLetterQueues[0].routingKey,
    ttl: fromEnv.deadLetterQueues[0].ttl || defaultRabbitConfig.deadLetterQueues[0].ttl,
    retryAttempts: fromEnv.deadLetterQueues[0].retryAttempts || defaultRabbitConfig.deadLetterQueues[0].retryAttempts },
  {
    name: fromEnv.deadLetterQueues[1].name || defaultRabbitConfig.deadLetterQueues[1].name,
    exchange: fromEnv.deadLetterQueues[1].exchange || defaultRabbitConfig.deadLetterQueues[1].exchange,
    mainExchange: fromEnv.mainQueue.exchange || defaultRabbitConfig.mainQueue.exchange,
    routingKey: defaultRabbitConfig.deadLetterQueues[1].routingKey,
    ttl: fromEnv.deadLetterQueues[1].ttl || defaultRabbitConfig.deadLetterQueues[1].ttl,
    retryAttempts: fromEnv.deadLetterQueues[1].retryAttempts || defaultRabbitConfig.deadLetterQueues[1].retryAttempts
  }]
};
