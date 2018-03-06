'use strict';

const eventMapper = () => {

  const toMultipleEvents = function*(event) {
    return [event];
  };

  return {
    toMultipleEvents
  };
};

module.exports = eventMapper;