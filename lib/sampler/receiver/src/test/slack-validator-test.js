'use strict';

const moment = require('abacus-moment');
const { SlackValidator, OutOfSlackError } = require('../lib/slack-validator');

describe('SlackValidator', () => {
  const pastInterval = 10000;
  const futureInterval = 5000;

  let slackValidator;
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    slackValidator = new SlackValidator({ pastInterval, futureInterval });
  });

  afterEach(() => {
    clock.restore();
  });


  context('when event timestamp is within slack and close to past end', () => {

    it('the timestamp is valid', () => {
      const timestamp = moment.utc().valueOf();
      clock.tick(pastInterval);
      slackValidator.validate(timestamp);
    });
  });

  context('when event timestamp is within slack and close to future end', () => {

    it('the timestamp is valid', () => {
      const timestamp = moment.utc().valueOf() + futureInterval;
      slackValidator.validate(timestamp);
    });
  });

  context('when event timestamp is out of slack in the past', () => {

    it('the event is invalid', () => {
      const timestamp = moment.utc().valueOf();
      clock.tick(pastInterval + 1);
      expect(() => slackValidator.validate(timestamp)).to.throw(OutOfSlackError);
    });
  });

  context('when event timestamp is out of slack in the future', () => {

    it('the event is invalid', () => {
      const timestamp = moment.utc().valueOf() + futureInterval + 1;
      expect(() => slackValidator.validate(timestamp)).to.throw(OutOfSlackError);
    });

  });

});
