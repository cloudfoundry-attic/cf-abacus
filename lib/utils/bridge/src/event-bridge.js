'use strict';

const util = require('util');
const EventEmitter = require('events');

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
  const eventMapper = opts.eventMapper;
  const convertEvent = opts.convertEvent;
  const usageReporter = opts.usageReporter;
  const carryOver = opts.carryOver;
  const progress = opts.progress;
  const delayGenerator = opts.delayGenerator;
  let pollTimer = undefined;

  const writeToCarryOver = yieldable((usage, response, guid, state, cb) => {
    carryOver.write(usage, response, guid, state, cb);
  });
  const adjustTimestamp = yieldable(carryOver.adjustTimestamp);
  const reportUsage = yieldable(usageReporter.report);

  const filterEvent = (event) => {
    for (const filter of eventFilters) 
      if (filter(event)) 
        return true;
    return false;
  };

  const sendUsage = function*(usage, event) {
    debug('Reporting usage...');
    const response = yield reportUsage(usage); 
    if (isCreatedResponse(response)) {
      debug('Writing to carry over ...');
      yield writeToCarryOver(usage, response, event.metadata.guid, event.entity.state);
    } else if (isConflictingResponse(response)) {
      debug('Conflicting usage document: %o', usage);
      emitter.emit('usage.conflict');
    } else  
      throw new Error(util.format('Error reporting usage! Response: %j', response));
  };

  const processEvent = function*(event) {
    debug('Filtering event...');
    if (filterEvent(event)) {
      debug('Event filtered.');
      emitter.emit('usage.skip');
      return;
    }

    debug(`Mapping event with state ${event.entity.state} to multiple events ...`);
    const mappedEvents = yield eventMapper.toMultipleEvents(event);
    if(mappedEvents.businessError) {
      debug(`${mappedEvents.businessError}. Skipping event!`);
      emitter.emit('usage.skip');
      return;
    }

    for(let mappedEvent of mappedEvents) {
      debug('Converting event to usage ...');
      const usage = convertEvent(mappedEvent);
      if (!usage) {
        debug('Event skipped.');
        emitter.emit('usage.skip');
        return;
      }
      
      debug('Adjusting usage timestamp...');
      const adjustedUsage = yield adjustTimestamp(usage, event.metadata.guid); 

      yield sendUsage(adjustedUsage, mappedEvent);
    }
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
