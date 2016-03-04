'use strict';

const request = require('abacus-request');
const urienv = require('abacus-urienv');

const _ = require('underscore');
const head = _.head;
const tail = _.tail;
const memoize = _.memoize;

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge-paging');

// Resolve service URIs
const uris = memoize(() => urienv({
  api: 80
}));

const processResources = (resources, processResourceFn, cb) => {
  if (!resources || resources.length === 0) {
    debug('No more resources to process');
    cb();
    return;
  }
  debug('Left %d resources for processing', resources.length);
  const resource = head(resources);
  processResourceFn(resource, (error, response) => {
    if (error || response) {
      debug('Processing resource %j failed with error %j and response %j',
        resource, error, response);
      return cb(error, response);
    }
    processResources(tail(resources), processResourceFn, cb);
  });
};

const readPage = (pageURI, cfAdminToken,
  { processResourceFn, callback = () => {} }) => {
  const token = cfAdminToken();
  debug('Reading app usage with token: %j from %s', token, uris().api);
  if (!token) {
    debug('Missing CF token');
    return callback('Missing CF token', undefined);
  }

  request.get(':api:page', {
    api: uris().api,
    page: pageURI,
    headers: {
      Authorization: token
    },
    json: true
  }, (error, response) => {
    if (error || response.statusCode !== 200) {
      debug('Cannot fetch resource from %s; page: %s; error %s; response %j',
        uris().api, pageURI, error, response);
      callback(error, response);
      return;
    }

    processResources(response.body.resources, processResourceFn,
      (error, errorResponse) => {
        if (error || errorResponse)
          return callback(error, errorResponse);

        const nextUrl = response.body.next_url;
        if (!nextUrl) {
          debug('Last page processed.');
          return callback();
        }

        debug('Processing page %s...', nextUrl);
        readPage(nextUrl, cfAdminToken, {
          processResourceFn: processResourceFn,
          callback: callback
        });
      });
  });
};

// Export our public functions
module.exports.readPage = readPage;
