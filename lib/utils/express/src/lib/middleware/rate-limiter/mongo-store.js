'use strict';

const moment = require('abacus-moment');
const edebug = require('abacus-debug')('e-abacus-express-rate-limit-mongo-store');

const resetValue = 1;

class MongoStore {

  constructor(collection, windowSizeMs) {
    this.collection = collection;
    this.windowSizeMs = windowSizeMs;
  };

  incr(key, cb) {
    this.collection.findOneAndUpdate({
      _id: key
    }, {
      $inc: { requestsCount: 1 },
      $setOnInsert: { firstRequestTimestamp: moment.now() }
    }, {
      upsert: true,
      returnOriginal: false
    }, (err, result) => {
      if (err) {
        edebug('Error while $inc requests count for "%s". Error: ', key, err);
        // Hide the actual error, as in case it is returned, express-rate-limit would interrupt the current request
        // and return 500 to the client.
        cb(undefined, resetValue);
        return;
      }

      if (this._isOutdated(result.value.firstRequestTimestamp))
        this._resetKey(key, cb);
      else
        cb(null, result.value.requestsCount);
    });
  };

  _unsupportedOperation(operation) {
    const message = `Unsupported operation "${operation}".'`;
    edebug(message);
    throw new Error(message);
  }

  decrement(key) {
    // This method is called only when RateLimit uses skipFailedRequests=true property.
    // As we do not use this property "decrement" method is not needed.
    this._unsupportedOperation('decrement');
  };

  resetKey(key) {
    // This method is never called by RateLimit, so it is not neccessery for correct functioning.
    this._unsupportedOperation('resetKey');
  };

  _isOutdated(timestamp) {
    const now = moment.now();
    return now - timestamp > this.windowSizeMs;
  };

  _resetKey(key, cb) {
    this.collection.update({
      _id: key
    },{
      $set: {
        requestsCount: resetValue,
        firstRequestTimestamp: moment.now()
      }
    }, (err, result) => {
      if(err)
        // Hide the actual error, as in case it is returned, express-rate-limit would interrupt the current request
        // and return 500 to the client.
        edebug('Error while reseting key "%s". Error:', key, err);

      return cb(undefined, resetValue);
    });
  }
};

module.exports = MongoStore;
