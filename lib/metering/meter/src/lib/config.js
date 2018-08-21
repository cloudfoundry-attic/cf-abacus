'use strict';

const { extend, omit } = require('underscore');

const threeMinutesInMs = 180000;
const twentySevenMinutesInMs = 1620000;

module.exports.createMeterConfiguration = (basicConfig, envReader) => {
  // 100 retries on first DL queue = 5 hours
  // 150 retries on second DL queue = 2 days 19 hours 30 minutes
  // total: 3 days 30 minutes
  /* eslint complexity: [1, 15] */
  const config = {
    db: {
      partitions: envReader.readInt('DB_PARTITIONS', 6),
      alias: envReader.readString('DBALIAS', 'db')
    },
    rabbitMQ: {
      mainQueue: {
        exchange: envReader.readString('MAIN_EXCHANGE', 'main-queue-exchange'),
        routingKey: '#',
        prefetchLimit: envReader.readInt('PREFETCH_LIMIT', 6)
      },
      deadLetterQueues: [{
        name: envReader.readString('FIRST_DL_NAME', 'first-dl-queue'),
        exchange: envReader.readString('FIRST_DL_EXCHANGE', 'first-dl-exchange'),
        mainExchange: envReader.readString('MAIN_EXCHANGE', 'main-queue-exchange'),
        routingKey: '#',
        ttl: envReader.readInt('FIRST_DL_TTL', threeMinutesInMs),
        retryAttempts: envReader.readInt('FIRST_DL_RETRIES', 100)
      },
      {
        name: envReader.readString('SECOND_DL_NAME', 'second-dl-queue'),
        exchange: envReader.readString('SECOND_DL_EXCHANGE', 'second-dl-exchange'),
        mainExchange: envReader.readString('MAIN_EXCHANGE', 'main-queue-exchange'),
        routingKey: '#',
        ttl: envReader.readInt('SECOND_DL_TTL', twentySevenMinutesInMs),
        retryAttempts: envReader.readInt('SECOND_DL_RETRIES', 150)
      }]
    }
  };
  config.rabbitMQ.mainQueue.name = basicConfig.collectQueue;
  config.rabbitMQ.uris = basicConfig.rabbitUris[0];

  return extend({}, config, omit(basicConfig, ['collectQueue', 'rabbitUris']));
};
