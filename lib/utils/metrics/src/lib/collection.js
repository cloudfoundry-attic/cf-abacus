'use strict';

const moment = require('abacus-moment');

class Window {
  constructor(duration) {
    this.duration = duration;
    this.currentSlotIndex = 0;
    this.currentSlotAmount = 0;
    this.previousSlotAmount = 0;
  }

  inc(currentTime, amount) {
    this.shift(currentTime);
    this.currentSlotAmount += amount;
  }

  getRate(currentTime) {
    this.shift(currentTime);
    return this.previousSlotAmount / (this.duration / 1000);
  }

  shift(currentTime) {
    const currentIndex = Math.floor(currentTime / this.duration);
    const isCurrentSlot = currentIndex == this.currentSlotIndex;
    const isNextSlot = currentIndex == this.currentSlotIndex + 1;

    if (!isCurrentSlot) {
      if (isNextSlot)
        // we have entered into the next time range
        this.previousSlotAmount = this.currentSlotAmount;
      else
        // we have entered into a time range far into the
        // future (there was a 'long' duration of inactivity)
        this.previousSlotAmount = 0;

      // reset slot
      this.currentSlotIndex = currentIndex;
      this.currentSlotAmount = 0;
    }
  }
};

class Counter {
  constructor() {
    this.value = 0;
    this.secondsWindow = new Window(1000);
    this.minutesWindow = new Window(60 * 1000);
    this.hoursWindow = new Window(60 * 60 * 1000);
  }

  inc(amount) {
    const increment = amount == undefined ? 1 : Number(amount);
    this.value += increment;

    const currentTime = moment.now();
    this.secondsWindow.inc(currentTime, increment);
    this.minutesWindow.inc(currentTime, increment);
    this.hoursWindow.inc(currentTime, increment);
  }

  get() {
    return this.value;
  }

  summary() {
    const currentTime = moment.now();
    return {
      total: this.value,
      rateLastSec: this.secondsWindow.getRate(currentTime),
      rateLastMin: this.minutesWindow.getRate(currentTime),
      rateLastHour: this.hoursWindow.getRate(currentTime)
    };
  }
};

class Log {
  constructor() {
    this.lines = new Array(3);
    this.insertIndex = 0;
  }

  get capacity() {
    return this.lines.length;
  }

  write(line) {
    const offset = this.insertIndex % this.capacity;
    this.lines[offset] = line;
    this.insertIndex++;
  }

  summary() {
    let start = Math.max(0, this.insertIndex - this.capacity);
    let end = this.insertIndex - 1;

    let lines = [];
    for (let index = start; index <= end; index++) {
      const offset = index % this.capacity;
      lines.push(this.lines[offset]);
    }

    return {
      lines
    };
  }
};

class Collection {
  constructor() {
    this.counters = new Map();
    this.logs = new Map();
  }

  counter(name) {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new Counter();
      this.counters.set(name, counter);
    }
    return counter;
  }

  log(name) {
    let log = this.logs.get(name);
    if (!log) {
      log = new Log();
      this.logs.set(name, log);
    }
    return log;
  }

  summary() {
    let summary = {
      counters: {},
      logs: {}
    };
    this.counters.forEach((counter, name) => {
      summary.counters[name] = counter.summary();
    });
    this.logs.forEach((log, name) => {
      summary.logs[name] = log.summary();
    });
    return summary;
  }
};

module.exports = {
  Collection
};
