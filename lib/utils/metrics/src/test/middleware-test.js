'use strict';

const express = require('abacus-express');
const request = require('abacus-request');
const { createRouter } = require('../lib/middleware');

describe('middleware', () => {
  const summary = {
    counters: {
      'test1': {}
    },
    logs: {
      'test2': {}
    }
  };

  let server;

  beforeEach((done) => {
    const collection = {
      summary: () => {
        return summary;
      }
    };
    const router = createRouter(collection);

    const app = express();
    app.use('/v1', router);
    server = app.listen(0, done);
  });

  afterEach(() => {
    server.close();
  });

  it('can get call metrics', (done) => {
    request.get('http://localhost::port/v1/metrics', {
      port: server.address().port
    }, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(200);
      expect(resp.body).to.deep.equal(summary);
      done();
    });
  });
});
