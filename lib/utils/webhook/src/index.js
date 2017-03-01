'use strict';

// Wrapper around the request module providing an easy way to implement a
// Webhook.

const request = require('request').defaults({ method: 'post' });
const throttle = require('abacus-throttle');
const tmap = require('abacus-transform').map;

/* jshint undef: false */
/* jshint unused: false */
/* eslint complexity: [2, 10] */

// Setup debug log
const debug = require('abacus-debug')('abacus-webhook');
// const edebug = require('abacus-debug')('e-abacus-webhook');

/**
 * Create a webhook with the given uris.
 * @param  {String[]} uris - a list of uris to post to.
 * @param  {Object} opts - configuration options object.
 * @param  {number} opts.concurrency - the maximum number of posts to be
 * performed concurrently.
 * @return {function} a function that makes requests to each url.
 */
const webhook = (uris, opts, cb) => {
  // Handle undefined options
  const options = opts || {};

  // Handle uris list inside options
  const urls = uris || options.uris || options.urls || [];

  debug('Send a request to each of %o', urls)

  // Specify the maximum number of concurrent calls
  const trequest = throttle(request, options.concurrency || 5);

  // Inject options object into each request.
  const otrequest = (uri, it, list, next) => trequest(uri, options, next);

  return tmap(urls, otrequest, (err, res) => cb(err, res));
};


// Export a public webhook function that handles
// the input parameters in the proper order.
const pwebhook = (uris, opts, cb) => {
  // Only two arguments were input
  if (typeof opts === 'function') {

    // webhook(opts, cb)
    if(!Array.isArray(uris))
      return webhook(uris.uris || uris.urls, uris, opts);

    // webhook(uris, cb)
    return webhook(uris, undefined, opts);
  }

  return webhook(uris, opts, cb);
};

// Export our public functions
module.exports = pwebhook;
