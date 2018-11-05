'use strict';

const EventEmitter = require('events');

class Scheduler {
  constructor() {
    this.emitter = new EventEmitter();
  }

  async schedule(func, interval) {
    while (true)
      try {
        await this._sleep(interval);
        await func();
        this.emitter.emit('success');
      } catch (e) {
        this.emitter.emit('failure', e);
      }
  }

  on(eventName, listener) {
    this.emitter.on(eventName, listener);
  }

  _sleep(duration) {
    return new Promise((cb) => setTimeout(cb, duration));
  };
};

module.exports = {
  Scheduler
};
