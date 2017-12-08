'use strict';

const EventEmitter = require('events');
const util = require('util');

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const debug = require('abacus-debug')('abacus-event-bridge');
const edebug = require('abacus-debug')('e-abacus-event-bridge');

const isCreatedResponse = (response) => response && response.statusCode === 201;

const isConflictingResponse = (response) => response && response.statusCode === 409;

const create = (opts) => {
  const emitter = new EventEmitter();
  const eventReaderFactory = opts.eventReaderFactory;
  const eventFilters = opts.eventFilters;
  const convertEvent = opts.convertEvent;
  const usageReporter = opts.usageReporter;
  const carryOver = opts.carryOver;
  const progress = opts.progress;
  const delayGenerator = opts.delayGenerator;
  let pollTimer = undefined;

  const writeToCarryOver = yieldable((usage, event, response, cb) => {
    carryOver.write(usage, response, event.metadata.guid, event.entity.state, cb);
  });

  const adjustTimestamp = yieldable(carryOver.adjustTimestamp);

  const reportUsage = yieldable(usageReporter.report);

  const sendUsage = function*(usage, event) {
    const response = yield reportUsage(usage);
    if (isCreatedResponse(response)) yield writeToCarryOver(usage, event, response);
    else if (isConflictingResponse(response)) emitter.emit('usage.conflict');
    else throw new Error(util.format('Error reporting usage! Response: %j', response));
  };

  const filterEvent = (event) => {
    for (const filter of eventFilters) if (filter(event)) return true;
    return false;
  };

  const processEvent = function*(event) {
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
  };

  const safelyClearProgress = function*() {
    try {
      debug('Clearing saved progress...Starting from beginning...');
      yield progress.clear();
    } catch (clearErr) {
      edebug('Failed to clear progress: ', clearErr);
    }
  };

  const processAvailableEvents = function*() {
    const eventReader = eventReaderFactory
      .createEventReader(progress.get().guid);

    const yNextEvent = yieldable(eventReader.nextEvent);
    const reportStart = moment.now();

    let event;
    try {
      while(event = yield yNextEvent()) {
        debug('Processing event: %j', event);
        yield processEvent(event);

        debug('Saving progress. Timestamp: %s', event.metadata.created_at);
        yield progress.save({
          guid: event.metadata.guid,
          timestamp: event.metadata.created_at
        });

        debug('Successfully processed event.');
        emitter.emit('usage.success', reportStart);
      }
    } catch (err) {
      edebug('Error processing events: %o', err);
      if (err.guidNotFound) {
        edebug('Cloud Controller cannot find GUID "%s". ' +
            'Restarting reporting, starting from epoch.', progress.get().guid);
        yield safelyClearProgress();
        return;
      }

      edebug('Failed to process event: ', err);
      emitter.emit('usage.failure', err, reportStart);

      throw err;
    }
  };

  const schedulePolling = (afterTimeout) => {
    debug(
      'Scheduling event polling to run after "%s" milliseconds, ' + 'starting from guid: "%s"',
      afterTimeout,
      progress.get().guid
    );

    pollTimer = setTimeout(() => {
      functioncb(processAvailableEvents)((err) => {
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
