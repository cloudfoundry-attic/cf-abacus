'use strict';

const request = require('abacus-request');
const urienv = require('abacus-urienv');

const _ = require('underscore');
const head = _.head;
const tail = _.tail;
const memoize = _.memoize;

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge-paging');
const edebug = require('abacus-debug')('e-abacus-cf-bridge-paging');

// Resolve service URIs
const uris = memoize(() => urienv({
  api: 80
}));

const processResources = (resources, processResourceFn, perf, cb) => {
  const t0 = Date.now();
  if (!resources || resources.length === 0) {
    debug('No more resources to process');
    perf.report('paging.resources.end', t0);
    return cb();
  }
  debug('Left %d resources for processing', resources.length);
  const resource = head(resources);
  processResourceFn(resource, (error, response) => {
    if (error || response) {
      edebug('Processing resource %j failed with error %j and response %j',
        resource, error, response);
      perf.report('paging.resources.failure', t0);
      return cb(error, response);
    }
    perf.report('paging.resources.success', t0);
    processResources(tail(resources), processResourceFn, perf, cb);
  });
};

const readPage = (pageURI, cfAdminToken, perf,
  { processResourceFn, callback = () => {} }) => {
  const t0 = Date.now();
  const token = cfAdminToken();
  debug('Reading app usage with token: %j from %s', token, uris().api);
  if (!token) {
    edebug('Missing CF token');
    perf.report('paging.failure', t0);
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
      edebug('Cannot fetch resource from %s; page: %s; error %s; response %j',
        uris().api, pageURI, error, response);
      perf.report('paging.failure', t0);
      callback(error, response);
      return;
    }

    processResources(response.body.resources, processResourceFn, perf,
      (error, errorResponse) => {
        if (error || errorResponse) {
          perf.report('paging.failure', t0);
          return callback(error, errorResponse);
        }

        const nextUrl = response.body.next_url;
        if (!nextUrl) {
          debug('Last page processed.');
          perf.report('paging.success', t0);
          return callback();
        }

        debug('Processing page %s...', nextUrl);
        readPage(nextUrl, cfAdminToken, perf, {
          processResourceFn: processResourceFn,
          callback: callback
        });
      });
  });
};

// Export our public functions
module.exports.readPage = readPage;
