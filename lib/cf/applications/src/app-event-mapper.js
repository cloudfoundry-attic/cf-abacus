'use strict';

const debug = require('abacus-debug')('abacus-cf-services-event-mapper');

const eventMapper = () => {
  return {
    toMultipleEvents: function*(event) {
      debug(`Mapping event with state ${event.entity.state} to multiple events ...`);
      return [event];
    }
  };
};

module.exports = eventMapper;
