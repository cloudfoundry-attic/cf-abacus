'use strict';

const EventEmitter = require('events');
const util = require('util');
const moment = require('abacus-moment');
const paging = require('abacus-paging');
const perf = require('abacus-perf');

const debug = require('abacus-debug')('abacus-bridge-event-reader');
const edebug = require('abacus-debug')('e-abacus-bridge-event-reader');

const isGuidNotFoundResponse = (response) => {
  return response && response.statusCode === 400 &&
    response.body && response.body.code === 10005;
};

const createGuidNotFoundError = (guid) => {
  const err = new Error('Event with specified GUID not found.');
  err.guidNotFound = true;
  return err;
};

/**
 * "The list of usage events returned from the API is not guaranteed to be
 * complete. Events may still be processing at the time of the query, so
 * events that occurred before the final event may still appear
 * [...]
 * it is recommended that operators select their ‘after_guid’ from an event
 * far enough back in time to ensure that all events have been processed"
 *
 * https://www.cloudfoundry.org/how-to-bill-on-cloud-foundry/
 */
const isOldEnough = (resource, minAge) => {
  const now = moment.now();
  const resourceDate = moment.utc(resource.metadata.created_at).valueOf();
  const age = now - resourceDate;
  return age > minAge;
};

const create = (opts) => {
  const poll = (callback) => {
    debug('Polling events from "%s" with min age "%s"', opts.url, opts.minAge);
    const emitter = new EventEmitter();

    const onReadPageDocument = (doc, cb) => {
      if (isOldEnough(doc, opts.minAge))
        callback(doc, cb);
      else
        cb();
    };

    const onReadPageSuccess = () => {
      emitter.emit('finished');
    };

    const onReadPageFailure = (err, response) => {
      if (isGuidNotFoundResponse(response))
        emitter.emit('finished', createGuidNotFoundError());
      else {
        const msg = util.format(
          'Could not read events due to error "%s" and response "%j".',
          err, response);
        edebug(msg);
        emitter.emit('finished', new Error(msg));
      }
    };

    process.nextTick(() => {
      paging.readPage(opts.url, opts.token, perf, opts.statistics, {
        processResourceFn: onReadPageDocument,
        success: onReadPageSuccess,
        failure: onReadPageFailure
      });
    });
    return emitter;
  };

  return {
    poll
  };
};

module.exports = create;
