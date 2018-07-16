'use strict';

const express = require('abacus-express');
const request = require('abacus-request');
const { createRouter } = require('../lib/middleware');

describe('middleware', () => {
  let server;

  beforeEach((done) => {
    const fakeCounter = {
      name: 'fake-counter',
      summary: () => ({ 'fake': 'counter-summary' })
    };
    const fakeBulletin = {
      name: 'fake-bulletin',
      summary: () => ({ 'fake': 'bulletin-summary' })
    };

    const fakeCollection = {
      counterIterator: function*() {
        yield fakeCounter;
      },
      bulletinIterator: function*() {
        yield fakeBulletin;
      }
    };
    const router = createRouter(fakeCollection);

    const app = express();
    app.use('/metrics', router);
    server = app.listen(0, done);
  });

  afterEach(() => {
    server.close();
  });

  it('can get all metrics', (done) => {
    request.get('http://localhost::port/metrics', {
      port: server.address().port
    }, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(200);
      expect(resp.body).to.deep.equal({
        counters: {
          'fake-counter': {
            'fake': 'counter-summary'
          }
        },
        bulletins: {
          'fake-bulletin': {
            'fake': 'bulletin-summary'
          }
        }
      });
      done();
    });
  });
});
