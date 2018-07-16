'use strict';

const { Counter } = require('./counter');
const { Bulletin } = require('./bulletin');

class Collection {
  constructor() {
    this.counters = new Map();
    this.bulletins = new Map();
  }

  counter(name) {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new Counter(name);
      this.counters.set(name, counter);
    }
    return counter;
  }

  *counterIterator() {
    for (let counter of this.counters.values())
      yield counter;
  }

  bulletin(name) {
    let bulletin = this.bulletins.get(name);
    if (!bulletin) {
      bulletin = new Bulletin(name);
      this.bulletins.set(name, bulletin);
    }
    return bulletin;
  }

  *bulletinIterator() {
    for (let bulletin of this.bulletins.values())
      yield bulletin;
  }
};

module.exports = {
  Collection
};
