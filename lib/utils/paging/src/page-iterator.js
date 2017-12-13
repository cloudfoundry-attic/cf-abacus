'use strict';

/* eslint-disable max-len */

const url = require('url');

const httpStatus = require('http-status-codes');
const request = require('abacus-request');

const debug = require('abacus-debug')('abacus-paging-page-iterator');
const edebug = require('abacus-debug')('e-abacus-paging-page-iterator');



/**
 * Returns an iterator for iterating over CF resources that
 * span across multiple pages.
 *
 * Use the `next` method of the iterator to retrieve the next available page.
 *
 * @param {string} url initial url of the resources
 * @param {function} token bearer token to use for the request
 */
const pageIterator = (resourceUrl, token) => {
  debug('Creating page iterator for URL "%s"', resourceUrl);
  const parsedUrl = url.parse(resourceUrl);
  const protocol = parsedUrl.protocol;
  const host = parsedUrl.host;
  let requestURL = resourceUrl;

  const getNextPageUrl = (nextUrl) => {
    if(!nextUrl)
      return undefined;

    return `${protocol}//${host}${nextUrl}`;
  };

  /**
   * Yields the next page available from the remote location.
   *
   * Next could yield an error if the remote resource is unreachable,
   * returns a non-200 status code, or the token provided is invalid.
   *
   * Calling `next` again after an error would retry the same page location,
   * hence a retry logic could be implemented on top, if needed.
   *
   * Next will yield `undefined` as a value once there are no more
   * pages available, otherwise the value yielded should be an array.
   *
   * Calling `next` after the last page is reached will continue to yield
   * `undefined`.
   *
   * @param {function} cb a callback to handle the read page.
   */
  const next = (cb) => {
    if (!requestURL) {
      debug('No more pages available. Iterator at end.');
      cb();
      return;
    }

    const authHeader = token();
    if (!authHeader) {
      const msg = 'Cannot retrieve page due to missing token';
      edebug(msg);
      cb(new Error(msg));
      return;
    }

    debug('Getting page from URL "%s"', requestURL);
    request.get(requestURL, {
      headers: {
        Authorization: authHeader
      },
      json: true
    }, (err, response) => {
      if (err) {
        edebug('Failed to get page due to: %o', err);
        err.response = response;
        return cb(err);
      }

      if (response.statusCode !== httpStatus.OK) {
        const msg = `Failed to get page due to unexpected HTTP status code: ${response.statusCode}`;
        edebug(msg);
        const err = new Error(msg);
        err.response = response;
        return cb(err);
      }

      requestURL = getNextPageUrl(response.body.next_url);
      const resources = response.body.resources;
      return cb(undefined, resources);
    });
  };

  return {
    next
  };
};

module.exports = pageIterator;
