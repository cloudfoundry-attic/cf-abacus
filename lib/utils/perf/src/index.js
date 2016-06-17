'use strict';

// Utility that collects real time function call performance and reliability
// metrics. The stats are computed using rolling windows of call successes,
// failures, timeouts, circuit breaker rejections and latencies.

const _ = require('underscore');
const events = require('abacus-events');

const keys = _.keys;
const filter = _.filter;
const last = _.last;
const extend = _.extend;
const reduce = _.reduce;
const map = _.map;
const find = _.find;

// Setup debug log
const debug = require('abacus-debug')('abacus-perf');

// Set up an event emitter allowing other modules to listen to accumulated call
// stats events
const emitter = events.emitter('call-metrics/emitter');
const on = (e, l) => {
  emitter.on(e, l);
};

// Set up an event emitter used to report function call metrics
const calls = events.emitter('abacus-perf/calls');

// Report function call metrics
const report = (name, time, latency, err, timeout, reject, circuit) => {
  const t = time || Date.now();
  const call = () => ({
    name: name,
    time: t,
    latency: latency === undefined ? Date.now() - t : latency,
    error: err || undefined,
    timeout: timeout || 0,
    reject: reject || false,
    circuit: circuit || 'closed'
  });
  calls.emit('message', {
    metrics: {
      call: call()
    }
  });
};

// Convert a list of buckets to a list of buckets in a rolling time window.
// Filter out the buckets that are out of the time window, and create a new
// bucket if necessary for the given time.
const roll = (buckets, time, win, max, proto) => {
  const i = Math.ceil(time / (win / max));
  const current = filter(buckets, (b) => b.i > i - max);
  const all = current.length !== 0 && last(current).i === i ? current :
    current.concat([extend({}, proto(), {
      i: i
    })]);
  return last(all, max);
};

// Return a rolling window of 10 secs of counts
const rollCounts = (buckets, time) => {
  return roll(buckets, time, 10000, 10, () => ({
    i: 0,
    ok: 0,
    errors: 0,
    timeouts: 0,
    rejects: 0
  }));
};

// Return a rolling window of 60 secs of latencies
const rollLatencies = (buckets, time) => {
  return roll(buckets, time, 60000, 6, () => ({
    i: 0,
    latencies: []
  }));
};

// Return a rolling window of 2 secs of health reports
const rollHealth = (buckets, time, counts) => {
  // Compute health from the given counts
  const b = reduce(counts, (a, c) => ({
    ok: a.ok + c.ok,
    errors: a.errors + c.errors + c.timeouts + c.rejects
  }), {
    ok: 0,
    errors: 0
  });

  // Roll the window and store the computed health in the last bucket
  const health = roll(buckets, time, 2000, 4, () => ({
    i: 0,
    ok: 0,
    errors: 0
  }));
  extend(last(health), b);
  return health;
};

// Store accumulated function call stats per function name
// Warning: accumulatedStats is a mutable variable
let accumulatedStats = {};

// Return the accumulated stats for a function
const stats = (name, time, roll) => {
  const t = time || Date.now();
  const s = accumulatedStats[name] || {
    name: name,
    time: t,
    counts: [],
    latencies: [],
    health: [],
    circuit: 'closed'
  };
  /* eslint no-extra-parens: 1 */
  return roll !== false ? (() => {
    const counts = rollCounts(s.counts, t);
    return {
      name: name,
      time: t,
      counts: counts,
      latencies: rollLatencies(s.latencies, t),
      health: rollHealth(s.health, t, counts),
      circuit: s.circuit
    };
  })() : {
    name: name,
    time: t,
    counts: s.counts,
    latencies: s.latencies,
    health: s.health,
    circuit: s.circuit
  };
};

// Reset the accumulated reliability stats for a function (but keep the
// accumulated latencies)
const reset = (name, time) => {
  const t = time || Date.now();

  // Warning: mutating variable accumulatedStats
  /* eslint no-extra-parens: 1 */
  const astats = ((s) => {
    return s ? {
      name: name,
      time: t,
      counts: [],
      latencies: s.latencies,
      health: [],
      circuit: 'closed'
    } : {
      name: name,
      time: t,
      counts: [],
      latencies: [],
      health: [],
      circuit: 'closed'
    };
  })(accumulatedStats[name]);
  accumulatedStats[name] = astats;

  // Propagate new stats to all the listeners
  debug('Emitting stats for function %s', name);
  emitter.emit('message', {
    metrics: {
      stats: astats
    }
  });
  return astats;
};

// Return all the accumulated stats
const all = (time, roll) => {
  const t = time || Date.now();
  return map(keys(accumulatedStats), (k) => stats(k, t, roll));
};

// Process function call metrics and update accumulated call stats
const accumulateStats = (name, time, latency, err, timeout,
  reject, circuit) => {
  debug('Accumulating stats for function %s', name);
  debug('latency %d, err %s, timeout %d, reject %s, circuit %s',
      latency, err, timeout, reject, circuit);

  // Retrieve the current call stats for the given function
  const s = stats(name, time, false);

  // Compute up to date counts window and increment counts in the last bucket
  const counts = rollCounts(s ? s.counts : [], time);
  const updateCount = (c) => {
    c.ok = c.ok + (!err && !timeout && !reject ? 1 : 0);
    c.errors = c.errors + (err ? 1 : 0);
    c.timeouts = c.timeouts + (timeout ? 1 : 0);
    c.rejects = c.rejects + (reject ? 1 : 0);
    debug('%d ok, %d errors, %d timeouts, %d rejects, %d count buckets',
        c.ok, c.errors, c.timeouts, c.rejects, counts.length);
  };
  updateCount(last(counts));

  // Compute up to date latencies window and add latency to the last bucket,
  // up to the max bucket size
  const latencies = rollLatencies(s ? s.latencies : [], time);
  if(!err && !timeout && !reject) {
    const updateLatency = (l) => {
      l.latencies = l.latencies.length < 100 ?
          l.latencies.concat([latency]) : l.latencies;
      debug('%d latencies, %d latencies buckets',
          l.latencies.length, latencies .length);
    };
    updateLatency(last(latencies));
  }

  // Compute up to date health report window
  const health = rollHealth(s ? s.health : [], time, counts);
  const h = last(health);
  debug('%d ok, %d errors, %d health buckets', h.ok, h.errors, health.length);

  // Store and return the new accumulated function call stats
  // Warning: mutating variable accumulatedStats
  const astats = {
    name: name,
    time: time,
    counts: counts,
    latencies: latencies,
    health: health,
    circuit: circuit
  };
  accumulatedStats[name] = astats;

  // Propagate new stats to all the listeners
  debug('Emitting stats for function %s', name);
  emitter.emit('message', {
    metrics: {
      stats: astats
    }
  });
  return astats;
};

// Process function call metrics messages and function call stats messages
const onMessage = (msg) => {
  if(msg.metrics) {
    debug('Received message %o', keys(msg).concat(keys(msg.metrics)));
    if(msg.metrics.call) {
      // Process call metrics and emit updated accumulated call stats
      const c = msg.metrics.call;
      accumulateStats(
        c.name, c.time, c.latency, c.error, c.timeout, c.reject, c.circuit);
    }
    if(msg.metrics.stats) {
      // Store latest accumulated stats
      debug('Storing stats for function %s', msg.metrics.stats.name);
      accumulatedStats[msg.metrics.stats.name] = msg.metrics.stats;
    }
  }
};

// Determine the health of the app based on the accumulated metrics
const healthy = (threshold) => {

  // Go through each function call metrics
  return find(all(Date.now(), false), (stat) => {

    // Go through its health status and calculate total requests & errors
    const total = reduce(stat.health, (a, c) => ({
      requests: a.requests + a.errors + c.ok + c.errors,
      errors: a.errors + c.errors
    }), {
      requests: 0,
      errors: 0
    });

    const percent = 100 * (total.errors / (total.requests || 1));
    debug('%s has %d% failure rate', stat.name, percent);

    // If one function call is not healthy, conclude that the app is
    // not healthy.
    return percent > (threshold || 5);

  }) ? false : true;
};

calls.on('message', onMessage);

// Export our public functions
module.exports.report = report;
module.exports.stats = stats;
module.exports.reset = reset;
module.exports.healthy = healthy;
module.exports.all = all;
module.exports.onMessage = onMessage;
module.exports.on = on;
