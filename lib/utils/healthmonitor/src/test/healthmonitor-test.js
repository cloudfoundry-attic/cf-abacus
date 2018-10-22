'use strict';

const moment = require('abacus-moment');
const EventEmitter = require('events');
const createHealthMonitor = require('..');

describe('healthchecker', () => {
  const threshold = 1000;
  const shortDuration = threshold - 1;
  const longDuration = threshold + 1;


  let healthmonitor;

  context('when multiple events are registered', () => {
    let monitorableStub;
    const successEvent1 = 'usage.success.1';
    const successEvent2 = 'usage.success.2';
    const failureEvent1 = 'usage.failure.1';
    const failureEvent2 = 'usage.failure.2';

    beforeEach(() => {
      monitorableStub = {
        on: sinon.stub()
      };
      healthmonitor = createHealthMonitor(monitorableStub, threshold, {
        success: [successEvent1, successEvent2],
        failure: [failureEvent1, failureEvent2]
      });
    });

    it('all events are monitored', () => {
      assert.callCount(monitorableStub.on, 4);
      assert.calledWith(monitorableStub.on, successEvent1);
      assert.calledWith(monitorableStub.on, successEvent2);
      assert.calledWith(monitorableStub.on, failureEvent1);
      assert.calledWith(monitorableStub.on, failureEvent2);
    });

  });

  context('when single event is registered', () => {
    const successEvent = 'usage.success';
    const failureEvent = 'usage.failure';

    let clock;
    let monitorable;

    beforeEach(() => {
      monitorable = new EventEmitter();
      clock = sinon.useFakeTimers(moment.now(), 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
      healthmonitor = createHealthMonitor(monitorable, threshold, {
        success: [successEvent],
        failure: [failureEvent]
      });
    });

    const itIsHealthy = () => {
      it('is healthy', () => {
        expect(healthmonitor.healthy()).to.equal(true);
      });
    };
  
    const itIsUnhealthy = () => {
      it('is unhealthy', () => {
        expect(healthmonitor.healthy()).to.equal(false);
      });
    };

    /*
     * In the tests that follow, we use some keywords to express how
     * events occur with relation to time. This should make test names
     * short and easier to comprehend.
     * 
     * 'failure' - indicates a 'usage.failure' event from monitorable emitter
     * 'success' - indicates a 'usage.success' event from monitorable emitter
     * '--long--' - indicates that time longer than the threshold has elapsed
     * '-short-' - indicates that time shorter than the threshold has elapsed
     * 'now' - indicates the point in time when the check is performed
     */

    context('no events', () => {
      itIsHealthy();
    });

    context('failure -short- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(shortDuration);
      });

      itIsHealthy();
    });

    context('failure --long-- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
      });

      itIsUnhealthy();
    });

    context('failure --long-- success now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
        monitorable.emit(successEvent);
      });

      itIsHealthy();
    });

    context('failure --long-- success -short- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
        monitorable.emit(successEvent);
        clock.tick(shortDuration);
      });

      itIsHealthy();
    });

    context('failure --long-- success --long-- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
        monitorable.emit(successEvent);
        clock.tick(longDuration);
      });

      itIsHealthy();
    });

    context('failure --long-- success --long-- failure -short- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
        monitorable.emit(successEvent);
        clock.tick(longDuration);
        monitorable.emit(failureEvent);
        clock.tick(shortDuration);
      });

      itIsHealthy();
    });

    context('failure --long-- success --long-- failure --long-- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
        monitorable.emit(successEvent);
        clock.tick(longDuration);
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
      });

      itIsUnhealthy();
    });

    context('failure -short- failure -short- failure -short- now', () => {
      beforeEach(() => {
        monitorable.emit(failureEvent);
        clock.tick(shortDuration);
        monitorable.emit(failureEvent);
        clock.tick(shortDuration);
        monitorable.emit(failureEvent);
        clock.tick(shortDuration);
      });

      itIsUnhealthy();
    });

    context('success --long-- failure -short- now', () => {
      beforeEach(() => {
        monitorable.emit(successEvent);
        clock.tick(longDuration);
        monitorable.emit(failureEvent);
        clock.tick(shortDuration);
      });

      itIsHealthy();
    });

    context('success -long-- failure -long- now', () => {
      beforeEach(() => {
        monitorable.emit(successEvent);
        clock.tick(longDuration);
        monitorable.emit(failureEvent);
        clock.tick(longDuration);
      });

      itIsUnhealthy();
    });
  });
});
