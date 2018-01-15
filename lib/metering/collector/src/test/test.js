/* eslint no-unused-expressions: 1 */
'use strict';

const request = require('supertest');
const rabbit = require('abacus-rabbitmq');
const validator = require('../lib/usage-validator.js');
const extend = require('underscore').extend;


let error = undefined;
let queueError = undefined;

const connManager = class ConnectionManager {
  constructor(uris) {
  }

  connect(setupFn) {
    return { sendToQueue: (msg) => {
      if (queueError)
        throw queueError;
    } };
  }
};

const rabbitMock = extend({}, rabbit, {
  ConnectionManager: connManager
});

const validateFunc = async(usage, auth) => {
  if (error)
    throw error;
};

const validatorMock = extend({}, validator, {
  validate: validateFunc
});

require.cache[require.resolve('abacus-rabbitmq')].exports = rabbitMock;
require.cache[require.resolve('../lib/usage-validator.js')].exports = validatorMock;

const collector = require('../index.js');

describe('collector tests', () => {

  process.env.RABBIT_URI = 'amqp://localhost';

  const usage = {
    start: 1420243200000,
    end: 1420245000000,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  };

  context('collect usage', () => {
    let server;

    before(() => {
      server = collector();
    });

    context('submit valid usage', () => {
      it('should pass', (done) => {
        request(server).
          post('/v1/metering/collected/usage').
          send(usage).
          expect(201).
          expect('Location', 'https://metering', done);
      });
    });

    context('usage validation fails', () => {
      before(() => {
        error = { badRequest: true, err: 'Bad request' };
      });

      it('should fail with 400', (done) => {
        request(server).
          post('/v1/metering/collected/usage').
          send(usage).
          expect(400).
          end((err, res) => {
            if (err)
              done(err);
            else
              done(res.error.text === 'Bad request' ?
                undefined : 'not expected error => ' + res.error.text);
          });

      });
    });

    context('abacus internal error occurs', () => {
      before(() => {
        error = { badRequest: false, err: 'Abacus Internal Server Error' };
      });

      it('should fail with 500', (done) => {
        request(server).
          post('/v1/metering/collected/usage').
          send(usage).
          expect(500).
          end((err, res) => {
            if (err)
              done(err);
            else
              done(res.error.text === 'Abacus Internal Server Error' ?
                undefined : 'not expected error => ' + res.error.text);
          });
      });
    });

    context('not able to enqueue messages', () => {
      before(() => {
        error = undefined;
        queueError = 'Unable to enqueue';
      });

      it('should fail with 500', (done) => {
        request(server).
          post('/v1/metering/collected/usage').
          send(usage).
          expect(500).
          end((err, res) => {
            if (err)
              done(err);
            else
              done(res.error.text === 'Unable to enqueue' ?
                undefined : 'not expected error => ' + res.error.text);
          });
      });
    });
  });
});
