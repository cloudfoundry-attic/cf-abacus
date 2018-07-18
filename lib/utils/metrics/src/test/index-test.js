'use strict';

const { Collection, NopCollection } = require('../lib/collection');
const { createRouter } = require('../lib/middleware');

describe('index', () => {
  let metrics;

  afterEach(() => {
    delete process.env.CUSTOM_METRICS;
    delete require.cache[require.resolve('../index')];
  });

  context('when metrics are enabled', () => {
    beforeEach(() => {
      process.env.CUSTOM_METRICS = 'true';
      metrics = require('../index');
    });

    it('provides default collection', () => {
      const collection = metrics.defaultCollection;
      expect(collection).to.be.instanceOf(Collection);
    });

    it('exposes Collection class', () => {
      const ExposedCollection = metrics.Collection;
      expect(ExposedCollection).to.equal(Collection);
    });

    it('exposes middleware', () => {
      const createMiddleware = metrics.createMiddleware;
      expect(createMiddleware).to.equal(createRouter);
    });

    it('exposes counter function from default collection', () => {
      const firstCounter = metrics.counter('name');
      const secondCounter = metrics.defaultCollection.counter('name');
      expect(secondCounter).to.equal(firstCounter);
    });

    it('exposes bulletin function from default collection', () => {
      const firstBulletin = metrics.bulletin('name');
      const secondBulletin = metrics.bulletin('name');
      expect(secondBulletin).to.equal(firstBulletin);
    });
  });

  context('when metrics are disabled', () => {
    beforeEach(() => {
      process.env.CUSTOM_METRICS = 'false';
      metrics = require('../index');
    });

    it('provides nop collection as default', () => {
      const collection = metrics.defaultCollection;
      expect(collection).to.be.instanceOf(NopCollection);
    });
  });
});
