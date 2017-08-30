'use strict';

const EventEmitter = require('events');

const execute = (executable) => {
  const emitter = new EventEmitter();
  process.nextTick(() => {
    executable.start((err) => {
      process.on('exit', () => {
        executable.stop((err) => {
          if (err)
            emitter.emit('stop-failure', err);
          else
            emitter.emit('stop-success');
        });
      });

      if (err)
        emitter.emit('start-failure', err);
      else
        emitter.emit('start-success');
    });
  });
  return emitter;
};

module.exports = execute;
