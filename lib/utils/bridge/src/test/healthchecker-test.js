'use strict';

const moment = require('abacus-moment');
const EventEmitter = require('events');
const createHealthChecker = require('../healthchecker');

describe('healthchecker', () => {

  const threshold = 1000;
  const shortDuration = threshold - 1;
  const longDuration = threshold + 1;

  let clock;
  let bridge;
  let healthchecker;

  const itIsHealthy = () => {
    it('is healthy', () => {
      expect(healthchecker.healthy()).to.equal(true);
    });
  };

  const itIsUnhealthy = () => {
    it('is unhealthy', () => {
      expect(healthchecker.healthy()).to.equal(false);
    });
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers(moment.now(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
    bridge = new EventEmitter();
    healthchecker = createHealthChecker(bridge, threshold);
  });

  /*
   * In the tests that follow, we use some keywords to express how
   * events occur with relation to time. This should make test names
   * short and easier to comprehend.
   * 
   * 'failure' - indicates a 'usage.failure' event from bridge emitter
   * 'success' - indicates a 'usage.success' event from bridge emitter
   * '--long--' - indicates that time longer than the threshold has elapsed
   * '-short-' - indicates that time shorter than the threshold has elapsed
   * 'now' - indicates the point in time when the check is performed
   */

  context('no events', () => {
    itIsHealthy();
  });

  context('failure -short- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(shortDuration);
    });

    itIsHealthy();
  });

  context('failure --long-- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(longDuration);
    });

    itIsUnhealthy();
  });

  context('failure --long-- success now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(longDuration);
      bridge.emit('usage.success');
    });

    itIsHealthy();
  });

  context('failure --long-- success -short- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(longDuration);
      bridge.emit('usage.success');
      clock.tick(shortDuration);
    });

    itIsHealthy();
  });

  context('failure --long-- success --long-- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(longDuration);
      bridge.emit('usage.success');
      clock.tick(longDuration);
    });

    itIsHealthy();
  });

  context('failure --long-- success --long-- failure -short- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(longDuration);
      bridge.emit('usage.success');
      clock.tick(longDuration);
      bridge.emit('usage.failure');
      clock.tick(shortDuration);
    });

    itIsHealthy();
  });

  context('failure --long-- success --long-- failure --long-- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(longDuration);
      bridge.emit('usage.success');
      clock.tick(longDuration);
      bridge.emit('usage.failure');
      clock.tick(longDuration);
    });

    itIsUnhealthy();
  });

  context('failure -short- failure -short- failure -short- now', () => {
    beforeEach(() => {
      bridge.emit('usage.failure');
      clock.tick(shortDuration);
      bridge.emit('usage.failure');
      clock.tick(shortDuration);
      bridge.emit('usage.failure');
      clock.tick(shortDuration);
    });

    itIsUnhealthy();
  });

  context('success --long-- failure -short- now', () => {
    beforeEach(() => {
      bridge.emit('usage.success');
      clock.tick(longDuration);
      bridge.emit('usage.failure');
      clock.tick(shortDuration);
    });

    itIsHealthy();
  });

  context('success -long-- failure -long- now', () => {
    beforeEach(() => {
      bridge.emit('usage.success');
      clock.tick(longDuration);
      bridge.emit('usage.failure');
      clock.tick(longDuration);
    });

    itIsUnhealthy();
  });

});
