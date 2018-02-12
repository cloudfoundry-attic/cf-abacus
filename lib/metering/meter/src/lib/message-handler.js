'use strict';

const MessageHandleStatus = require('abacus-rabbitmq').Consumer.MessageHandleStatus;

const util = require('util');
const { isFunction } = require('underscore');

const validateParam = (param, paramName, paramMethod) => {
  if(!isFunction(param[paramMethod]))
    throw new Error(util.format('%s is not valid', paramName));
};

class MessageHandler {

  constructor(normalizer, meter, accumulatorClient) {
    validateParam(normalizer, 'Normalizer', 'normalizeUsage');
    validateParam(meter, 'Meter', 'meterUsage');
    validateParam(accumulatorClient, 'AccumulatorClient', 'sendUsage');

    this.normalizer = normalizer;
    this.meter = meter;
    this.accumulatorClient = accumulatorClient;
  }

  async handle(msg) {
    try{
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(msg);
      const meterDoc = await this.meter.meterUsage(normalizedUsageDoc);
      await this.accumulatorClient.sendUsage(meterDoc);
      return MessageHandleStatus.SUCCESS;
    } catch (e) {
      if (e.metricComputation)
        return MessageHandleStatus.CANNOT_PROCESS;
      return MessageHandleStatus.RETRY;
    }

  }
}

module.exports.MessageHandler = MessageHandler;
