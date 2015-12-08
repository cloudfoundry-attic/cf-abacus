'use strict';

// Small utility functions to help work with Node events, including an event
// emitter that can be shared between modules in a process, and an iterator
// over a stream of events.

// We use a non camel case variable name intentionally here
/* eslint camelcase:1 */

const _ = require('underscore');
const events = require('events');
const emitStream = require('emit-stream');
const through = require('through');

const first = _.first;
const rest = _.rest;

// Don't limit the number of listeners
events.EventEmitter.defaultMaxListeners = 0;

// Return an emitter, if a name is provided the emitter is shared
const emitter = (name) => {
  if(name) return shared(name);
  const e = new events.EventEmitter();
  // Don't limit the number of listeners
  e.setMaxListeners(0);
  return e;
};

// Return a shared, named, event emitter
if(!global.__shared_emitters) global.__shared_emitters = [];
const shared = (name) => {
  const e = global.__shared_emitters[name];
  if(e)
    return e;
  const ne = emitter();
  global.__shared_emitters[name] = ne;
  return ne;
};

// Convert a Node event emitter to a pausable Node stream. Events are buffered
// while the stream is paused.
const stream = (emitter) => {
  // Create a stream 'through' transform that can be paused, buffers messages
  // while it's paused, then delivers them when it's resumed
  const pausable = through((data) =>
    pausable.queue(data[0] ? data : null), () => pausable.queue(null));

  // Turn the given emitter into an initially paused emit stream
  const stream = emitStream.toStream(emitter).pipe(pausable);
  stream.pause();
  return stream;
};

// Turn a Node event emitter into an async iterator. The iterator's next method
// takes a callback. The callback will be called with the next emitted event.
const iterator = (emitter) => {

  // First turn the emitter into a Node stream
  const nstream = stream(emitter);

  // Maintain a queue of the callbacks that we're expected to call with the
  // next events from the emitter
  // Warning: callbacks is a mutable variable
  let callbacks = [];

  // Dequeue and return the first callback in the queue
  const callback = () => {
    // Warning: mutating variable callbacks here
    const cb = first(callbacks);
    callbacks = rest(callbacks);
    return cb;
  };

  // Pipe the Node stream into a 'through' transform that captures events
  // and passes them to the callbacks
  nstream.pipe(through((data) => {
    // We got some data representing an event from the event emitter

    // Pause the stream now if we only have one callback in the queue
    if(callbacks.length === 1)
      nstream.pause();

    // Pass the event to the callback, we also convert from the [name, val]
    // produced by emit-stream to a { name: ..., value: ... } object
    callback()(undefined, {
      value: {
        name: data[0],
        value: data[1]
      },
      done: false
    });

  }, () => {

    // End of the stream, signalled by a null event, call the first
    // callback in the queue with done true
    callback()(undefined, {
      value: undefined,
      done: true
    });
  }));

  // Return an iterator
  const it = {};
  it.next = (cb) => {
    // The caller wants to be called back with the next event, add the
    // callback to our queue and resume the Node stream to get the next
    // available event
    callbacks = callbacks.concat([cb]);
    setImmediate(() => nstream.resume());
  };
  return it;
};

// Export our public functions
module.exports.emitter = emitter;
module.exports.stream = stream;
module.exports.iterator = iterator;

