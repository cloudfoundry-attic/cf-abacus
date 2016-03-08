'use strict';

const util = require('util');
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

const processResources = (resources, resourceFn, perf, statistics, cb) => {
  const t0 = Date.now();
  if (!resources || resources.length === 0) {
    debug('No more resources to process');
    statistics.paging.pageProcessEnd++;
    perf.report('paging.resources', t0, undefined, undefined, undefined, true);
    return cb();
  }
  const resource = head(resources);
  resourceFn(resource, (error, response) => {
    if (error || response) {
      const message = util.format('Processing resource %j failed with error ' +
        '%j and response %j', resource, error, response);
      edebug(message);
      statistics.paging.pageProcessFailures++;
      perf.report('paging.resources', t0, undefined, new Error(message));
      return cb(error, response);
    }
    statistics.paging.pageProcessSuccess++;
    perf.report('paging.resources', t0);
    processResources(tail(resources), resourceFn, perf, statistics, cb);
  });
};

const readPage = (pageURI, cfAdminToken, perf, statistics,
  { processResourceFn, callback = () => {} }) => {
  const t0 = Date.now();
  const token = cfAdminToken();
  debug('Reading %s with token: %j from %s', token, pageURI, uris().api);
  if (!token) {
    const message = 'Missing CF token';
    edebug(message);
    statistics.paging.missingToken++;
    perf.report('paging.pages', t0, undefined, new Error(message));
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
      const message = util.format('Cannot fetch resource from %s; page: %s; ' +
        'error %s; response %j', uris().api, pageURI, error, response);
      edebug(message);
      statistics.paging.pageReadFailures++;
      perf.report('paging.pages', t0, undefined, new Error(message));
      callback(error, response);
      return;
    }

    const resources = response.body.resources;
    if (resources)
      debug('Processing %d resources ...', resources.length);
    processResources(resources, processResourceFn, perf,
      statistics, (error, errorResponse) => {
        if (error || errorResponse) {
          perf.report('paging.pages', t0, new Error());
          return callback(error, errorResponse);
        }

        const nextUrl = response.body.next_url;
        if (!nextUrl) {
          debug('Last page processed.');
          statistics.paging.pageReadSuccess++;
          perf.report('paging.pages', t0);
          return callback();
        }

        debug('Processing page %s...', nextUrl);
        readPage(nextUrl, cfAdminToken, perf, statistics, {
          processResourceFn: processResourceFn,
          callback: callback
        });
      });
  });
};

// Export our public functions
module.exports.readPage = readPage;
