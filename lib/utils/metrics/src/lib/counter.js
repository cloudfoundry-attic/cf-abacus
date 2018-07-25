'use strict';

const moment = require('abacus-moment');
const { Window } = require('./window');

class CounterWindow extends Window {
  constructor(duration) {
    super(duration);
    this.currentSlotAmount = 0;
    this.previousSlotAmount = 0;
  }

  shift() {
    this.previousSlotAmount = this.currentSlotAmount;
  }

  resetPrevious() {
    this.previousSlotAmount = 0;
  }

  resetCurrent() {
    this.currentSlotAmount = 0;
  }

  inc(currentTime, amount) {
    this.update(currentTime);
    this.currentSlotAmount += amount;
  }

  calculatePreviousRate(currentTime) {
    this.update(currentTime);
    return this.previousSlotAmount * (1000 / this.duration);
  }

  estimateCurrentRate(currentTime) {
    this.update(currentTime);
    const elaspedSlotTime = Math.max(1, currentTime % this.duration);
    return this.currentSlotAmount * (1000 / elaspedSlotTime);
  }

  estimateCompositeRate(currentTime) {
    this.update(currentTime);
    const elaspedSlotTime = currentTime % this.duration;
    const compositeDuration = this.duration + elaspedSlotTime;
    const compositeAmount = this.previousSlotAmount + this.currentSlotAmount;
    return compositeAmount * (1000 / compositeDuration);
  }
};

class Counter {
  constructor(name) {
    this.name = name;
    this.value = 0;
    this.secondsWindow = new CounterWindow(1000);
    this.minutesWindow = new CounterWindow(60 * 1000);
    this.hoursWindow = new CounterWindow(60 * 60 * 1000);
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
      rate: this.minutesWindow.estimateCompositeRate(currentTime)
    };
  }

  report() {
    const currentTime = moment.now();
    return {
      total: this.value,
      intervals: {
        second: {
          previous_rate: this.secondsWindow.calculatePreviousRate(currentTime),
          current_rate: this.secondsWindow.estimateCurrentRate(currentTime)
        },
        minute: {
          previous_rate: this.minutesWindow.calculatePreviousRate(currentTime),
          current_rate: this.minutesWindow.estimateCurrentRate(currentTime)
        },
        hour: {
          previous_rate: this.hoursWindow.calculatePreviousRate(currentTime),
          current_rate: this.hoursWindow.estimateCurrentRate(currentTime)
        }
      }
    };
  }
};

class NopCounter {
  inc(_) {
  }

  get() {
    return 0;
  }

  summary() {
    return {};
  }

  report() {
    return {};
  }
};

module.exports = {
  Counter,
  NopCounter
};
