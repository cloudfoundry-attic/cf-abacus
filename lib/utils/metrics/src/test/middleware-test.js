'use strict';

const express = require('abacus-express');
const request = require('abacus-request');
const { createRouter } = require('../lib/middleware');

describe('middleware', () => {
  let server;

  beforeEach((done) => {
    const fakeCounter = {
      name: 'fake-counter',
      summary: () => ({ 'fake': 'counter-summary' }),
      report: () => ({ 'fake': 'counter-report' })
    };
    const fakeBulletin = {
      name: 'fake-bulletin',
      summary: () => ({ 'fake': 'bulletin-summary' }),
      report: () => ({ 'fake': 'bulletin-report' })
    };

    const fakeCollection = {
      findCounter: (name) => {
        if (name == 'fake-counter') return fakeCounter;
        return undefined;
      },
      counterIterator: function*() {
        yield fakeCounter;
      },
      findBulletin: (name) => {
        if (name == 'fake-bulletin') return fakeBulletin;
        return undefined;
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

  it('can return a summary of all metrics', (done) => {
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

  it('can return a detailed report for specific counter', (done) => {
    request.get('http://localhost::port/metrics/counters/fake-counter', {
      port: server.address().port
    }, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(200);
      expect(resp.body).to.deep.equal({
        'fake': 'counter-report'
      });
      done();
    });
  });

  it('returns not found on report query for missing counter', (done) => {
    request.get('http://localhost::port/metrics/counters/missing', {
      port: server.address().port
    }, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(404);
      done();
    });
  });

  it('can return a detailed report for specific bulletin', (done) => {
    request.get('http://localhost::port/metrics/bulletins/fake-bulletin', {
      port: server.address().port
    }, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(200);
      expect(resp.body).to.deep.equal({
        'fake': 'bulletin-report'
      });
      done();
    });
  });

  it('returns not found on report query for missing bulletin', (done) => {
    request.get('http://localhost::port/metrics/bulletins/missing', {
      port: server.address().port
    }, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(404);
      done();
    });
  });
});
