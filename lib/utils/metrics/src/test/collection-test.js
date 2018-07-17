'use strict';

const { Counter } = require('../lib/counter');
const { Bulletin } = require('../lib/bulletin');
const { Collection } = require('../lib/collection');

describe('collection', () => {
  const counterName = 'test.counter';
  const bulletinName = 'test.bulletin';

  let collection;

  beforeEach(() => {
    collection = new Collection();
  });

  describe('counter', () => {
    it('is possible to create counter', () => {
      const counter = collection.counter(counterName);
      expect(counter).to.be.instanceOf(Counter);
      expect(counter.name).to.equal(counterName);
    });

    it('is possible to reuse the same counter', () => {
      const firstCounter = collection.counter(counterName);
      const secondCounter = collection.counter(counterName);
      expect(secondCounter).to.equal(firstCounter);
    });

    it('is possible to find existing counter', () => {
      const counter = collection.counter(counterName);
      const foundCounter = collection.findCounter(counterName);
      expect(foundCounter).to.equal(counter);
      const missingCounter = collection.findCounter('missing');
      expect(missingCounter).to.equal(undefined);
    });

    it('it possible to iterate over counters', () => {
      const firstCounter = collection.counter('first');
      const secondCounter = collection.counter('second');

      const counters = [];
      for (let counter of collection.counterIterator())
        counters.push(counter);

      expect(counters.length).to.equal(2);
      expect(counters).to.include(firstCounter);
      expect(counters).to.include(secondCounter);
    });
  });

  describe('bulletin', () => {
    it('is possible to create bulletin', () => {
      const bulletin = collection.bulletin(bulletinName);
      expect(bulletin).to.be.instanceOf(Bulletin);
      expect(bulletin.name).to.equal(bulletinName);
    });

    it('is possible to reuse the same bulletin', () => {
      const firstBulletin = collection.bulletin(bulletinName);
      const secondBulletin = collection.bulletin(bulletinName);
      expect(secondBulletin).to.equal(firstBulletin);
    });

    it('is possible to find existing bulletin', () => {
      const bulletin = collection.bulletin(bulletinName);
      const foundBulletin = collection.findBulletin(bulletinName);
      expect(foundBulletin).to.equal(bulletin);
      const missingBulletin = collection.findBulletin('missing');
      expect(missingBulletin).to.equal(undefined);
    });

    it('it possible to iterate over bulletins', () => {
      const firstBulletin = collection.bulletin('first');
      const secondBulletin = collection.bulletin('second');

      const bulletins = [];
      for (let bulletin of collection.bulletinIterator())
        bulletins.push(bulletin);

      expect(bulletins.length).to.equal(2);
      expect(bulletins).to.include(firstBulletin);
      expect(bulletins).to.include(secondBulletin);
    });
  });
});
