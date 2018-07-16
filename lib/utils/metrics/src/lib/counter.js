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
  constructor(name) {
    this.name = name;
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

module.exports = {
  Counter
};
