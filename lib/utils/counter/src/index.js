'use strict';

class Counter {
  constructor() {
    this.counters = {};
  }

  get(counterName) {
    return this.counters[counterName] || 0;
  }

  set(counterName, value) {
    this.counters[counterName] = value;
  }

  list() {
    return this.counters;
  }

  increase(counterName, increment = 1) {
    this.set(counterName, this.get(counterName) + increment);
  }

  decrease(counterName, decrement = 1) {
    this.set(counterName, this.get(counterName) - decrement);
  }
}

module.exports = Counter;
