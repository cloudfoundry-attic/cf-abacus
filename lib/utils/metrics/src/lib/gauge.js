'use strict';

const moment = require('abacus-moment');
const { Window } = require('./window');

class GaugeWindow extends Window {
  constructor(duration) {
    super(duration);
    this.resetPrevious();
    this.resetCurrent();
  }

  shift() {
    this.previousMin = this.currentMin;
    this.previousMax = this.currentMax;
    this.previousSum = this.currentSum;
    this.previousCount = this.currentCount;
  }

  resetPrevious() {
    this.previousMin = undefined;
    this.previousMax = undefined;
    this.previousSum = 0;
    this.previousCount = 0;
  }

  resetCurrent() {
    this.currentMin = undefined;
    this.currentMax = undefined;
    this.currentSum = 0;
    this.currentCount = 0;
  }

  set(currentTime, value) {
    this.update(currentTime);

    if (this.currentCount === 0) {
      this.currentMin = value;
      this.currentMax = value;
    } else {
      this.currentMin = Math.min(this.currentMin, value);
      this.currentMax = Math.max(this.currentMax, value);
    }
    this.currentSum += value;
    this.currentCount++;
  }

  calculatePrevious(currentTime) {
    this.update(currentTime);

    if (this.previousCount === 0)
      return {
        min: undefined,
        max: undefined,
        avg: undefined
      };

    return {
      min: this.previousMin,
      max: this.previousMax,
      avg: this.previousSum / this.previousCount
    };
  }

  calculateCurrent(currentTime) {
    this.update(currentTime);

    if (this.currentCount === 0)
      return {
        min: undefined,
        max: undefined,
        avg: undefined
      };

    return {
      min: this.currentMin,
      max: this.currentMax,
      avg: this.currentSum / this.currentCount
    };
  }

  calculateComposite(currentTime) {
    this.update(currentTime);

    if (this.previousCount === 0 && this.currentCount === 0)
      return {
        min: undefined,
        max: undefined,
        avg: undefined
      };

    if (this.previousCount === 0)
      return this.calculateCurrent(currentTime);

    if (this.currentCount === 0)
      return this.calculatePrevious(currentTime);

    return {
      min: Math.min(this.previousMin, this.currentMin),
      max: Math.max(this.previousMax, this.currentMax),
      avg: (this.previousSum + this.currentSum) / (this.previousCount + this.currentCount)
    };
  }
};

class Gauge {
  constructor(name) {
    this.name = name;
    this.secondsWindow = new GaugeWindow(1000);
    this.minutesWindow = new GaugeWindow(60 * 1000);
    this.hoursWindow = new GaugeWindow(60 * 60 * 1000);
  }

  set(value) {
    this.value = value;

    const currentTime = moment.now();
    this.secondsWindow.set(currentTime, value);
    this.minutesWindow.set(currentTime, value);
    this.hoursWindow.set(currentTime, value);
  }

  get() {
    return this.value;
  }

  summary() {
    const currentTime = moment.now();
    return this.minutesWindow.calculateComposite(currentTime);
  }

  report() {
    const currentTime = moment.now();
    return {
      intervals: {
        previous_second: this.secondsWindow.calculatePrevious(currentTime),
        current_second: this.secondsWindow.calculateCurrent(currentTime),
        previous_minute: this.minutesWindow.calculatePrevious(currentTime),
        current_minute: this.minutesWindow.calculateCurrent(currentTime),
        previous_hour: this.hoursWindow.calculatePrevious(currentTime),
        current_hour: this.hoursWindow.calculateCurrent(currentTime)
      }
    };
  }
}

class NopGauge {
  set(value) {
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
}

module.exports = {
  Gauge,
  NopGauge
};
