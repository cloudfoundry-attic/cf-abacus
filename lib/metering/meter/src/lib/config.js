'use strict';

const { extend, omit } = require('underscore');

const threeMinutesInMs = 180000;
const twentySevenMinutesInMs = 1620000;

module.exports.createMeterConfiguration = (basicConfig, getFromEnv) => {
  // 100 retries on first DL queue = 5 hours
  // 150 retries on second DL queue = 2 days 19 hours 30 minutes
  // total: 3 days 30 minutes
  /* eslint complexity: [1, 15] */
  const config = {
    db: {
      partitions: getFromEnv('DB_PARTITIONS') ? parseInt(getFromEnv('DB_PARTITIONS')) : 6,
      alias: getFromEnv('DBALIAS') || 'db'
    },
    rabbitMQ: {
      mainQueue: {
        exchange: getFromEnv('MAIN_EXCHANGE') || 'main-queue-exchange',
        routingKey: '#',
        prefetchLimit: getFromEnv('PREFETCH_LIMIT') ? parseInt(getFromEnv('PREFETCH_LIMIT')) : 6
      },
      deadLetterQueues: [{
        name: getFromEnv('FIRST_DL_NAME') || 'first-dl-queue',
        exchange: getFromEnv('FIRST_DL_EXCHANGE') || 'first-dl-exchange',
        mainExchange: getFromEnv('MAIN_EXCHANGE') || 'main-queue-exchange',
        routingKey: '#',
        ttl: getFromEnv('FIRST_DL_TTL') ? parseInt(getFromEnv('FIRST_DL_TTL')) : threeMinutesInMs,
        retryAttempts: getFromEnv('FIRST_DL_RETRIES') ? parseInt(getFromEnv('FIRST_DL_RETRIES')) : 100 },
      {
        name: getFromEnv('SECOND_DL_NAME') || 'second-dl-queue',
        exchange: getFromEnv('SECOND_DL_EXCHANGE') || 'second-dl-exchange',
        mainExchange: getFromEnv('MAIN_EXCHANGE') || 'main-queue-exchange',
        routingKey: '#',
        ttl: getFromEnv('SECOND_DL_TTL') ? parseInt(getFromEnv('SECOND_DL_TTL')) : twentySevenMinutesInMs,
        retryAttempts: getFromEnv('SECOND_DL_RETRIES') ? parseInt(getFromEnv('SECOND_DL_RETRIES')) : 150
      }]
    }
  };
  config.rabbitMQ.mainQueue.name = basicConfig.collectQueue;
  config.rabbitMQ.uris = basicConfig.rabbitUris[0];

  return extend({}, config, omit(basicConfig, ['collectQueue', 'rabbitUris']));
};
