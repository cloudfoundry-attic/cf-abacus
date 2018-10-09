'use strict';

const moment = require('abacus-moment');

class OutOfSlackError extends Error {
  constructor() {
    super('event timestamp is out of slack');
    Error.captureStackTrace(this, OutOfSlackError);
  }
}

class SlackValidator {
  
  constructor(slack) {
    this.slack = slack;
  }

  validate(eventTimestamp) {
    if (moment.utc().subtract(this.slack.pastInterval).isAfter(eventTimestamp))
      throw new OutOfSlackError();

    if (moment.utc().add(this.slack.futureInterval).isBefore(eventTimestamp))
      throw new OutOfSlackError();
  };

};

module.exports = {
  SlackValidator,
  OutOfSlackError
};
