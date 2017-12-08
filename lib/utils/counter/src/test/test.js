'use strict';

const Counter = require('..');

const counterName = 'myMeasureName';

describe('get', () => {
  const counter = new Counter();

  it('returns 0 for non-existing measure', () => {
    expect(counter.get(counterName)).to.equal(0);
  });
});

describe('set', () => {
  const counter = new Counter();

  it('sets counter to a predefined value', () => {
    counter.set(counterName, 7);
    expect(counter.get(counterName)).to.equal(7);
  });
});

describe('list', () => {
  context('with existing counters', () => {
    const counter = new Counter();
    counter.set(counterName, 7);
    counter.set('new name', 12);
    counter.set('other counter', -56);

    it('returns all counters', () => {
      expect(counter.list()).to.deep.equal({
        myMeasureName: 7,
        'new name': 12,
        'other counter': -56
      });
    });
  });

  context('with no existing counters', () => {
    const counter = new Counter();

    it('returns empty object', () => {
      expect(counter.list()).to.deep.equal({});
    });
  });
});

describe('increase', () => {
  context('with a new counter instance', () => {
    let counter;

    beforeEach(() => {
      counter = new Counter();
    });

    it('increases with 1 by default', () => {
      counter.increase(counterName);
      expect(counter.get(counterName)).to.equal(1);
    });

    it('increases with specified value', () => {
      counter.increase(counterName, 2);
      expect(counter.get(counterName)).to.equal(2);
    });
  });

  context('with an existing counter instance', () => {
    const counter = new Counter();
    counter.set(counterName, 10);

    it('increases with 1 by default', () => {
      counter.increase(counterName);
      expect(counter.get(counterName)).to.equal(11);
    });

    it('increases with specified value', () => {
      counter.increase(counterName, 2);
      expect(counter.get(counterName)).to.equal(13);
    });
  });
});

describe('decrease', () => {
  context('with a new counter instance', () => {
    let counter;

    beforeEach(() => {
      counter = new Counter();
    });

    it('decreases with 1 by default', () => {
      counter.decrease(counterName);
      expect(counter.get(counterName)).to.equal(-1);
    });

    it('decreases with specified value', () => {
      counter.decrease(counterName, 2);
      expect(counter.get(counterName)).to.equal(-2);
    });
  });

  context('with an existing counter instance', () => {
    const counter = new Counter();
    counter.set(counterName, 10);

    it('decreases with 1 by default', () => {
      counter.decrease(counterName);
      expect(counter.get(counterName)).to.equal(9);
    });

    it('decreases with specified value', () => {
      counter.decrease(counterName, 2);
      expect(counter.get(counterName)).to.equal(7);
    });
  });
});
