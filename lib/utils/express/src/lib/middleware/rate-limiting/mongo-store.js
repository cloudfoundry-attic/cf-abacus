'use strict';

const moment = require('abacus-moment');
const edebug = require('abacus-debug')('e-abacus-express-rate-limit-mongo-store');

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
        edebug('Error while $inc requests count for "%s": ', key, err);
        cb(err);
        return;
      }

      if (this._isOutdated(result.value.firstRequestTimestamp))
        this._resetKeyTo(key, 1, cb);
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

  _resetKeyTo(key, value, cb) {
    this.collection.update({
      _id: key
    },{
      $set: {
        requestsCount: value,
        firstRequestTimestamp: moment.now()
      }
    }, (err, result) => {
      if(err) {
        edebug('Error while reseting key "%s"', key, err);
        return cb(err);
      }

      return cb(undefined, value);
    });
  }
};

module.exports = MongoStore;
