'use strict';

const transform = require('abacus-transform');
const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-notify');

// Takes a list of urls and does a POST request on everyone one asynchronously
const notify = (l, cb) => {
  debug('Notifying %o', l);
  transform.map(l, (uri, i, uris, ucb) => {
    // Calls a post on the given URL
    request.post(uri, {}, (err, res) => {
      // Fills the respective place in the response with error or success
      if(err)
        ucb(null, 0);
      else
        ucb(null, 1);
    });
  }, cb);
};

module.exports = notify;
