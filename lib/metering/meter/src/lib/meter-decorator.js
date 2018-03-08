'use strict';

const edebug = require('abacus-debug')('e-abacus-usage-metering-meter-decorator');

const meterDecorator = (meter, errorDb) => {
  const meterUsage = async(usageDoc) => {
    let meteredUsage;
    try {
      meteredUsage = await meter.meterUsage(usageDoc);
    } catch(e) {
      if (e.isPlanBusinessError)
        try {
          await errorDb.store(usageDoc, e);
        } catch (err) {
          edebug('Error while storing errored message [%o] to error db: %o', usageDoc, e);
          throw err;
        }
      else
        throw e;
    }
    return meteredUsage;
  };
  return {
    meterUsage
  };
};

module.exports = meterDecorator;
