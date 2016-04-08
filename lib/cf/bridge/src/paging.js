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
    cb();
    return;
  }
  const resource = head(resources);
  resourceFn(resource, (error, response) => {
    if (error || response) {
      const message = util.format('Processing resource %j failed', resource);
      edebug(message);
      statistics.paging.pageProcessFailures++;
      perf.report('paging.resources', t0, undefined, new Error(message));
      cb(error, response);
      return;
    }
    statistics.paging.pageProcessSuccess++;
    perf.report('paging.resources', t0);
    processResources(tail(resources), resourceFn, perf, statistics, cb);
  });
};

const readPage = (pageURI, cfAdminToken, perf, statistics,
  { processResourceFn, failure, success }) => {
  const t0 = Date.now();
  const token = cfAdminToken();
  debug('Reading %s with token: %j from %s', pageURI, token, uris().api);
  if (!token) {
    const message = 'Missing CF token';
    edebug(message);
    statistics.paging.missingToken++;
    perf.report('paging.pages', t0, undefined, new Error(message));
    failure('Missing CF token', undefined);
    return;
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
      failure(error, response);
      return;
    }

    const resources = response.body.resources;
    if (resources)
      debug('Processing %d resources ...', resources.length);
    processResources(resources, processResourceFn, perf,
      statistics, (error, errorResponse) => {
        if (error || errorResponse) {
          perf.report('paging.pages', t0, new Error());
          failure(error, errorResponse);
          return;
        }

        const nextUrl = response.body.next_url;
        if (!nextUrl) {
          debug('Last page processed.');
          statistics.paging.pageReadSuccess++;
          perf.report('paging.pages', t0);
          success();
          return;
        }

        debug('Processing page %s...', nextUrl);
        readPage(nextUrl, cfAdminToken, perf, statistics, {
          processResourceFn: processResourceFn,
          success: success,
          failure: failure
        });
      });
  });
};

// Export our public functions
module.exports.readPage = readPage;
