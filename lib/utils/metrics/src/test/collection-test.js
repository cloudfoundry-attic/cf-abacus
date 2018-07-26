'use strict';

const { Counter, NopCounter } = require('../lib/counter');
const { Bulletin, NopBulletin } = require('../lib/bulletin');
const { Gauge, NopGauge } = require('../lib/gauge');
const { Collection, NopCollection } = require('../lib/collection');

describe('collection', () => {
  const counterName = 'test.counter';
  const bulletinName = 'test.bulletin';
  const gaugeName = 'test.gauge';

  let collection;

  describe('Collection', () => {
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

    describe('gauge', () => {
      it('is possible to create gauge', () => {
        const gauge = collection.gauge(gaugeName);
        expect(gauge).to.be.instanceOf(Gauge);
        expect(gauge.name).to.equal(gaugeName);
      });

      it('is possible to reuse the same gauge', () => {
        const firstGauge = collection.gauge(gaugeName);
        const secondGauge = collection.gauge(gaugeName);
        expect(secondGauge).to.equal(firstGauge);
      });

      it('is possible to find existing gauge', () => {
        const gauge = collection.gauge(gaugeName);
        const foundGauge = collection.findGauge(gaugeName);
        expect(foundGauge).to.equal(gauge);
        const missingGauge = collection.findGauge('missing');
        expect(missingGauge).to.equal(undefined);
      });

      it('it possible to iterate over gauges', () => {
        const firstGauge = collection.gauge('first');
        const secondGauge = collection.gauge('second');

        const gauges = [];
        for (let gauge of collection.gaugeIterator())
          gauges.push(gauge);

        expect(gauges.length).to.equal(2);
        expect(gauges).to.include(firstGauge);
        expect(gauges).to.include(secondGauge);
      });
    });
  });

  describe('NopCollection', () => {
    beforeEach(() => {
      collection = new NopCollection();
    });

    it('always returns the same nop counter', () => {
      const firstCounter = collection.counter('first');
      const secondCounter = collection.counter('second');
      expect(secondCounter).to.equal(firstCounter);
      expect(secondCounter).to.be.instanceOf(NopCounter);
    });

    it('never finds counter', () => {
      collection.counter(counterName);
      const counter = collection.findCounter(counterName);
      expect(counter).to.equal(undefined);
    });

    it('has no counters to iterate over', () => {
      collection.counter(counterName);
      for (let _ of collection.counterIterator())
        assert.fail('there should be no counters', _);
    });

    it('always returns the same nop bulletin', () => {
      const firstBulletin = collection.bulletin('first');
      const secondBulletin = collection.bulletin('second');
      expect(secondBulletin).to.equal(firstBulletin);
      expect(secondBulletin).to.be.instanceOf(NopBulletin);
    });

    it('never finds bulletin', () => {
      collection.bulletin(bulletinName);
      const bulletin = collection.findBulletin(bulletinName);
      expect(bulletin).to.equal(undefined);
    });

    it('has no bulletins to iterate over', () => {
      collection.bulletin(bulletinName);
      for (let _ of collection.bulletinIterator())
        assert.fail('there should be no bulletins', _);
    });

    it('always returns the same nop gauge', () => {
      const firstGauge = collection.gauge('first');
      const secondGauge = collection.gauge('second');
      expect(secondGauge).to.equal(firstGauge);
      expect(secondGauge).to.be.instanceOf(NopGauge);
    });

    it('never finds gauge', () => {
      collection.gauge(gaugeName);
      const gauge = collection.findGauge(gaugeName);
      expect(gauge).to.equal(undefined);
    });

    it('has no gauges to iterate over', () => {
      collection.gauge(gaugeName);
      for (let _ of collection.gaugeIterator())
        assert.fail('there should be no gauges', _);
    });
  });
});
