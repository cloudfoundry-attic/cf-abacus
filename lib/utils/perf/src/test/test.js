'use strict';

// Utility that collects real time function call performance and reliability
// metrics.

const perf = require('..');
const events = require('events');

describe('abacus-perf', () => {
  it('accumulates function call stats', () => {

    // Listen to perf metrics events
    const on = spy();
    perf.on('message', on);

    // Report a few function call metrics
    const t = Date.now();
    perf.report('foo', t, 10, undefined, 0, false, 'closed');
    perf.report('foo', t, 15, new Error(), 0, false, 'closed');
    perf.report('foo', t, 20, undefined, 20, false, 'open');
    perf.report('foo', t, 0, undefined, 0, true, 'open');

    // Expect call stats computed from the submitted metrics
    const i = (w) => Math.ceil(t / w);
    const m = {
      name: 'foo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 1,
        errors: 1,
        timeouts: 1,
        rejects: 1
      }],
      latencies: [{
        i: i(10000),
        latencies: [10]
      }],
      health: [{
        i: i(500),
        ok: 1,
        errors: 3
      }],
      circuit: 'open'
    };
    expect(perf.stats('foo', t)).to.deep.equal(m);

    // Expect metrics to be emitted back
    expect(on.args.length).to.equal(4);
    expect(on.args[3]).to.deep.equal([{
      metrics: {
        stats: m
      }
    }]);
  });

  it('stores received function call stats', () => {

    // Emit a stats message
    const e = new events.EventEmitter();
    e.on('message', perf.onMessage);
    const t = Date.now();
    const i = (w) => Math.ceil(t / w);
    const m = {
      name: 'foo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 10,
        errors: 10,
        timeouts: 10,
        rejects: 10
      }],
      latencies: [{
        i: i(10000),
        latencies: [100]
      }],
      health: [{
        i: i(500),
        ok: 10,
        errors: 30
      }],
      circuit: 'closed'
    };
    e.emit('message', {
      metrics: {
        stats: m
      }
    });

    // Expect it to be stored as is
    expect(perf.stats('foo', t)).to.deep.equal(m);
    expect(perf.all(t)).to.deep.equal([m]);
  });

  it('resets function call stats', () => {

    // Report function call metrics
    const t = Date.now();
    perf.report('foo', t, 10, undefined, 0, false, 'closed');
    perf.report('foo', t, 15, new Error(), 0, false, 'closed');
    perf.report('foo', t, 20, undefined, 20, false, 'open');
    perf.report('foo', t, 0, undefined, 0, true, 'open');

    // Reset function call reliability stats
    perf.reset('foo', t);

    // Expect clean call reliability stats but latencies to still be
    // there
    const i = (w) => Math.ceil(t / w);
    const m = {
      name: 'foo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 0,
        errors: 0,
        timeouts: 0,
        rejects: 0
      }],
      latencies: [{
        i: i(10000),
        latencies: [100, 10]
      }],
      health: [{
        i: i(500),
        ok: 0,
        errors: 0
      }],
      circuit: 'closed'
    };
    expect(perf.stats('foo', t)).to.deep.equal(m);
  });

  it('performs healthcheck on healthy app', () => {

    // Emit a stats message
    const e = new events.EventEmitter();
    e.on('message', perf.onMessage);
    const t = Date.now();
    const i = (w) => Math.ceil(t / w);
    const m = {
      name: 'foo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 480,
        errors: 12,
        timeouts: 8,
        rejects: 0
      }],
      latencies: [{
        i: i(10000),
        latencies: [100, 10]
      }],
      health: [{
        i: i(500),
        ok: 480,
        errors: 20
      }],
      circuit: 'closed'
    };
    e.emit('message', {
      metrics: {
        stats: m
      }
    });
    const n = {
      name: 'boo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 992,
        errors: 2,
        timeouts: 6,
        rejects: 0
      }],
      latencies: [{
        i: i(10000),
        latencies: [100, 10]
      }],
      health: [{
        i: i(500),
        ok: 992,
        errors: 8
      }],
      circuit: 'closed'
    };
    e.emit('message', {
      metrics: {
        stats: n
      }
    });

    // the error percentage is below the threshold of 5.
    expect(perf.healthy(5)).to.equal(true);
  });

  it('performs healthcheck on sick app', () => {

    // Emit a stats message
    const e = new events.EventEmitter();
    e.on('message', perf.onMessage);
    const t = Date.now();
    const i = (w) => Math.ceil(t / w);
    const m = {
      name: 'foo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 474,
        errors: 26,
        timeouts: 8,
        rejects: 0
      }],
      latencies: [{
        i: i(10000),
        latencies: [100, 10]
      }],
      health: [{
        i: i(500),
        ok: 475,
        errors: 26
      }],
      circuit: 'closed'
    };
    e.emit('message', {
      metrics: {
        stats: m
      }
    });
    const n = {
      name: 'boo',
      time: t,
      counts: [{
        i: i(1000),
        ok: 992,
        errors: 2,
        timeouts: 6,
        rejects: 0
      }],
      latencies: [{
        i: i(10000),
        latencies: [100, 10]
      }],
      health: [{
        i: i(500),
        ok: 992,
        errors: 8
      }],
      circuit: 'closed'
    };
    e.emit('message', {
      metrics: {
        stats: n
      }
    });

    // The error percentage of foo is above the threshold of 5.
    expect(perf.healthy()).to.equal(false);
  });
});
