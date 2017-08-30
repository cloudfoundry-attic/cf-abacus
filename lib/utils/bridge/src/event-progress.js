'use strict';

const _ = require('underscore');
const pick = _.pick;

const create = (dbcache, startGuid) => {
  let cachedProgress = {
    guid: startGuid,
    timestamp: undefined
  };

  const load = function *() {
    const doc = yield dbcache.read();
    if (doc)
      cachedProgress = {
        guid: doc.lastRecordedGUID,
        timestamp: doc.lastRecordedTimestamp
      };
    return cachedProgress;
  };

  const save = function *(data) {
    cachedProgress = pick(data, 'guid', 'timestamp');
    yield dbcache.write({
      lastRecordedGUID: data.guid,
      lastRecordedTimestamp: data.timestamp
    });
  };

  const clear = function *() {
    yield save({
      guid: undefined,
      timestamp: undefined
    });
  };

  const get = () => cachedProgress;

  return {
    load,
    save,
    clear,
    get
  };
};

module.exports = create;
