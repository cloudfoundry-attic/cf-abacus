'use strict';

const EventEmitter = require('events');
const util = require('util');

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const debug = require('abacus-debug')('abacus-event-bridge');
const edebug = require('abacus-debug')('e-abacus-event-bridge');

const isCreatedResponse = (response) =>
  response && response.statusCode === 201;

const isConflictingResponse = (response) =>
  response && response.statusCode === 409;

const create = (opts) => {
  const emitter = new EventEmitter();
  const eventReader = opts.eventReader;
  const eventFilters = opts.eventFilters;
  const convertEvent = opts.convertEvent;
  const usageReporter = opts.usageReporter;
  const carryOver = opts.carryOver;
  const progress = opts.progress;
  const delayGenerator = opts.delayGenerator;
  let pollTimer = undefined;

  const writeToCarryOver = yieldable((usage, event, response, cb) => {
    carryOver.write(
      usage, response, event.metadata.guid, event.entity.state, cb);
  });

  const adjustTimestamp = yieldable(carryOver.adjustTimestamp);

  const reportUsage = yieldable(usageReporter.report);

  const sendUsage = function *(usage, event) {
    const response = yield reportUsage(usage);
    if (isCreatedResponse(response))
      yield writeToCarryOver(usage, event, response);
    else if (isConflictingResponse(response))
      emitter.emit('usage.conflict');
    else
      throw new Error(
        util.format('Error reporting usage! Response: %j', response));
  };

  const filterEvent = (event) => {
    for (const filter of eventFilters)
      if (filter(event))
        return true;
    return false;
  };

  const processEvent = function *(event) {
    debug('Filtering event...');
    if (filterEvent(event)) {
      debug('Event filtered.');
      emitter.emit('usage.skip');
      return;
    }
    debug('Converting event...');
    const usage = convertEvent(event);
    if (!usage) {
      debug('Event skipped.');
      emitter.emit('usage.skip');
      return;
    }
    debug('Created usage: %j', usage);
    debug('Adjusting usage timestamp...');
    const adjustedUsage = yield adjustTimestamp(usage, event.metadata.guid);
    debug('Reporting usage...');
    yield sendUsage(adjustedUsage, event);
    debug('Saving progress...');
    yield progress.save({
      guid: event.metadata.guid,
      timestamp: event.metadata.created_at
    });
  };

  const safelyClearProgress = function *() {
    try {
      debug('Clearing saved progress...Starting from beginning...');
      yield progress.clear();
    }
    catch (clearErr) {
      edebug('Failed to clear progress: ', clearErr);
    }
  };

  const pollEvents = (callback) => {
    debug('Polling events, starting from "%s"', progress.get().guid);

    const onPollEvent = function *(event) {
      debug('Event polled: %j', event);
      const reportStart = moment.now();
      try {
        yield processEvent(event);
        emitter.emit('usage.success', reportStart);
      }
      catch (err) {
        edebug('Failed to process event: ', err);
        emitter.emit('usage.failure', err, reportStart);
        throw err;
      }
    };

    const onPollFinished = function *(err) {
      if (!err)
        return;

      edebug('Error polling events: ', err);
      if (err.guidNotFound) {
        edebug('Cloud Controller cannot find GUID "%s". ' +
          'Restarting reporting, starting from epoch.', progress.get().guid);
        yield safelyClearProgress();
      }
      throw err;
    };
    eventReader
      .poll(progress.get().guid, functioncb(onPollEvent))
      .on('finished', (err) => {
        functioncb(onPollFinished)(err, callback);
      });
  };

  const schedulePolling = (afterTimeout) => {
    debug('Scheduling event polling to run after "%s" milliseconds, ' +
      'starting from guid: "%s"', afterTimeout, progress.get().guid);

    pollTimer = setTimeout(() => {
      pollEvents((err) => {
        if (!err)
          delayGenerator.reset();
        schedulePolling(delayGenerator.getNext());
      });
    }, afterTimeout);
  };

  const start = (cb) => {
    schedulePolling(delayGenerator.getNext());
    cb();
  };

  const stop = (cb) => {
    clearTimeout(pollTimer);
    cb();
  };

  return {
    start,
    stop,
    on: (name, listener) => {
      emitter.on(name, listener);
    }
  };
};

module.exports = create;
