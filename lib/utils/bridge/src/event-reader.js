'use strict';

const EventEmitter = require('events');
const util = require('util');
const moment = require('abacus-moment');
const { itemIterator, pageIterator } = require('abacus-paging');

const debug = require('abacus-debug')('abacus-bridge-event-reader');
const edebug = require('abacus-debug')('e-abacus-bridge-event-reader');

const isGuidNotFoundResponse = (response) => {
  return response && response.statusCode === 400 && response.body && response.body.code === 10005;
};

const createGuidNotFoundError = (guid) => {
  const err = new Error('Event with specified GUID not found.');
  err.guidNotFound = true;
  return err;
};

//
// "The list of usage events returned from the API is not guaranteed to be
// complete. Events may still be processing at the time of the query, so
// events that occurred before the final event may still appear
// [...]
// it is recommended that operators select their ‘after_guid’ from an event
// far enough back in time to ensure that all events have been processed"
//
// https://www.cloudfoundry.org/how-to-bill-on-cloud-foundry/
//
const isOldEnough = (resource, minAge) => {
  const now = moment.now();
  const resourceDate = moment.utc(resource.metadata.created_at).valueOf();
  const age = now - resourceDate;
  return age > minAge;
};

const create = (opts) => {
  const iterator = itemIterator(pageIterator(opts.url, opts.token));

  const poll = (callback) => {
    debug('Polling events from "%s" with min age "%s"', opts.url, opts.minAge);
    const emitter = new EventEmitter();

    const onItemError = (err) => {
      const response = err.response;
      if (isGuidNotFoundResponse(response)) {
        emitter.emit('finished', createGuidNotFoundError());
        return;
      }
      const msg = util.format(
        'Could not read events due to error "%s" and response "%j".',
        err, response);
      edebug(msg);
      emitter.emit('finished', new Error(msg));
    };

    const onItem = (err, doc) => {
      if (err) {
        onItemError(err);
        return;
      }
      if (!doc) {
        emitter.emit('finished');
        return;
      }
      if (!isOldEnough(doc, opts.minAge)) {
        emitter.emit('finished');
        return;
      }
      callback(doc, (err) => {
        if (err) {
          onItemError(err);
          return;
        }
        iterator.next(onItem);
      });
    };

    process.nextTick(() => {
      iterator.next(onItem);
    });

    return emitter;
  };

  return {
    poll
  };
};

module.exports = create;
