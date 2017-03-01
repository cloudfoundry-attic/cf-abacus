'use strict';

// Wrapper around the request module providing an easy way to implement a
// Webhook.

/* eslint no-unused-expressions: 1 */

const express = require('abacus-express');
const _ = require('underscore');
const map = _.map;
const range = _.range;
const webhook = require('..');

describe('abacus-webhook', () => {
  // Create ten subscriptions.
  const uris = map(range(10), () => {

    const handler = (req, res) => res.status(204).send();

    // Create an express server and listen on an ephemeral port.
    const server = express().post('/', handler).listen(0);

    // Export their subscription information
    return 'http://localhost:' + server.address().port + '/';
  });

  it('sends HTTP requests', (done) => {

    const json = {
      event_type: 'space_create',
      organization: '1c6e9105-a290-44b7-b51d-e78a6cf73539',
      space: '9833520b-24f4-4ef4-aa15-4b6c774d4e10'
    };

    const options = { json };

    const callback = (error, responses) => {
      expect(error).to.eql(undefined);
      map(responses, (response) => {
        expect(response).to.be.an('object');
        expect(response.statusCode).to.equal(204);
      });

      return done();
    };

    return webhook(uris, options, callback);

  });

  describe('handles each type of param list', () => {
    const callback = (error, responses, cb) => {
      expect(error).to.eql(undefined);
      map(responses, (response, index) => {
        expect(response).to.be.an('object');
        expect(response.statusCode).to.equal(204);
      });
      return cb();
    };

    const opts = { uris };

    it('webhook(uris, callback)', (done) => {
      return webhook(uris, (err, res) => callback(err, res, done));
    });

    it('webhook(options, callback)', (done) => {
      return webhook(opts, (err, res) => callback(err, res, done));
    });

    it('webhook(uris, undefined, callback)', (done) => {
      return webhook(uris, undefined, (err, res) => callback(err, res, done));
    });

    it('webhook(undefined, options, callback)', (done) => {
      return webhook(undefined, opts, (err, res) => callback(err, res, done));
    });

    it('webhook(uris, options, callback)', (done) => {
      return webhook(uris, {}, (err, res) => callback(err, res, done));
    });
  });

});
