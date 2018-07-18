'use strict';

const { Counter, NopCounter } = require('./counter');
const { Bulletin, NopBulletin } = require('./bulletin');

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

  findCounter(name) {
    return this.counters.get(name);
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

  findBulletin(name) {
    return this.bulletins.get(name);
  }

  *bulletinIterator() {
    for (let bulletin of this.bulletins.values())
      yield bulletin;
  }
};

class NopCollection {
  constructor() {
    this.dummyCounter = new NopCounter();
    this.dummyBulletin = new NopBulletin();
  }

  counter(_) {
    return this.dummyCounter;
  }

  findCounter(_) {
    return undefined;
  }

  *counterIterator() {
  }

  bulletin(_) {
    return this.dummyBulletin;
  }

  findBulletin(_) {
    return undefined;
  }

  *bulletinIterator() {
  }
};

module.exports = {
  Collection,
  NopCollection
};
