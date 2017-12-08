'use strict';

const moment = require('abacus-moment');
const paging = require('abacus-paging');

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

const handleError = (err, cb) => {
  const response = err.response;
  if (isGuidNotFoundResponse(response)) {
    cb(createGuidNotFoundError());
    return;
  }

  edebug('Could not read events due to error "%s" and response "%j".',
    err, response);
  cb(err);
};

const create = (opts) => {
  const { itemIterator, pageIterator } = paging;
  const iterator = itemIterator(pageIterator(opts.url, opts.token));
  let reachedTooYoungEvent = false;

  const nextEvent = (cb) => {
    if (reachedTooYoungEvent) {
      debug('Too young event already reached. Yielding "undefined".');
      cb();
      return;
    };

    iterator.next((err, doc) => {
      if (err) {
        handleError(err, cb);
        return;
      }

      debug('Event read: %j', doc);
      if (!doc) {
        cb();
        return;
      }

      if (!isOldEnough(doc, opts.minAge)) {
        debug('Found too young event. Yielding "undefined".');
        reachedTooYoungEvent = true;
        cb();
        return;
      }

      cb(undefined, doc);
    });
  };


  return {
    nextEvent
  };
};

module.exports = create;
