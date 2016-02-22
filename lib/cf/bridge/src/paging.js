'use strict';

const request = require('abacus-request');
const urienv = require('abacus-urienv');

const _ = require('underscore');
const head = _.head;
const tail = _.tail;

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge-paging');

// Resolve service URIs
const uris = urienv({
  api: 80
});

const processResources = (resources, processResourceFn, cb) => {
  if (!resources || resources.length === 0) {
    debug('No resources to process');
    cb();
    return;
  }

  const resource = head(resources);
  processResourceFn(resource, (error) => {
    if (error) {
      debug('Processing resource %j failed', resource);
      cb(error);
      return;
    }
    processResources(tail(resources), processResourceFn, cb);
  });
};

const readPage = (pageURI, cfAdminToken,
  { processResourceFn, onError = () => {} }) => {
  const token = cfAdminToken();
  debug('Reading app usage with token: %j from %s', token, uris.api);
  if (!token) {
    debug('Missing CF token');
    onError('Missing CF token', null);
    return;
  }

  request.get(':api:page', {
    api: uris.api,
    page: pageURI,
    headers: {
      Authorization: token
    },
    json: true
  }, (error, response) => {
    if (error || response.statusCode !== 200) {
      debug('Cannot fetch resource from %s; page: %s; error %s; response %j',
        uris.api, pageURI, error, response);
      onError(error, response);
      return;
    }

    processResources(response.body.resources, processResourceFn, (error) => {
      if (!error) {
        const nextUrl = response.body.next_url;
        if (nextUrl) {
          debug('Processing page %s...', nextUrl);
          readPage(nextUrl, cfAdminToken, {
            processResourceFn: processResourceFn,
            onError: onError
          });
        }
      }
    });
  });
};

// Export our public functions
module.exports.readPage = readPage;
