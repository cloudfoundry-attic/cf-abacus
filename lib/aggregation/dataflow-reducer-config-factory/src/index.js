'use strict';
const { createAccumulatorConfig } = require('./lib/accumulator-config');
const { createAggregatorConfig } = require('./lib/aggregator-config');

const getReducerConfig = (reducerName, secured, sampling, token) => {
  switch(reducerName) {
    case 'accumulator':
      return createAccumulatorConfig(secured, sampling, token);

    case 'aggregator':
      return createAggregatorConfig(secured, sampling, token);

    default:
      throw new Error('Unsupported reducer component ' + reducerName);
  };
};

module.exports = {
  getReducerConfig
};
