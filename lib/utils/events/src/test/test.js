'use strict';

// Small utility functions to help work with Node events, including an event
// emitter that can be shared between modules in a process, and an iterator
// over a stream of events.

const events = require('..');

describe('abacus-events', () => {
  it('creates shared event emitters', (done) => {
    const listener12 = spy();
    const listener3 = spy();

    // Get emitters and emits some events
    const emitter1 = events.emitter('test12');
    emitter1.on('msg', listener12);

    const emitter2 = events.emitter('test12');

    const emitter3 = events.emitter('test3');
    emitter3.on('msg', listener3);

    emitter2.emit('msg', {
      val: 12
    });
    emitter3.emit('msg', {
      val: 3
    });

    // Expect the two emitters to be the same and the listener to be called
    expect(emitter1).to.equal(emitter2);
    expect(listener12.args).to.deep.equal([
      [{
        val: 12
      }]
    ]);

    expect(emitter3).to.not.equal(emitter1);
    expect(listener3.args).to.deep.equal([
      [{
        val: 3
      }]
    ]);

    done();
  });

  it('iterates over a stream of events', (done) => {

    // Create an emitter and an async iterator over its event stream
    const e = events.emitter();
    const i = events.iterator(e);

    // Emit some events
    e.emit('message', {
      x: 1
    });
    e.emit('message', {
      x: 2
    });
    e.emit('message', {
      x: 3
    });

    // Iterate over the buffered event stream
    const cb = spy(() => {
      if(cb.args.length === 3) {
        expect(cb.args).to.deep.equal([
          [undefined, {
            done: false,
            value: {
              name: 'message',
              value: {
                x: 1
              }
            }
          }],
          [undefined, {
            done: false,
            value: {
              name: 'message',
              value: {
                x: 2
              }
            }
          }],
          [undefined, {
            done: false,
            value: {
              name: 'message',
              value: {
                x: 3
              }
            }
          }]
        ]);
        done();
      }
    });
    i.next(cb);
    i.next(cb);
    i.next(cb);
  });
});

