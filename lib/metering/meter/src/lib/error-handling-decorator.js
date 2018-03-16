'use strict';

const edebug = require('abacus-debug')('e-abacus-usage-metering-meter-decorator');

const run = async(fn, document, errorDb) => {
  let res;

  try {
    res = await fn(document);
  } catch (e) {
    if (e.isPlanBusinessError)
      try {
        await errorDb.store(document, e);
      } catch (err) {
        edebug('Error while storing errored message [%o] to error db: %o', document, e);
        throw err;
      }
    else
      throw e;
  }
  return res;
};

const errorHandlingDecorator = (propName, fn, errorDb) => {
  return {
    [propName]: (document) => run(fn, document, errorDb)
  };
};

module.exports = errorHandlingDecorator;
