'use strict';

// Support for Netflix Hystrix, serves a stream of Hystrix command stats

const _ = require('underscore');
const oauth = require('abacus-oauth');
const perf = require('abacus-perf');
const urienv = require('abacus-urienv');

const values = _.values;
const map = _.map;
const object = _.object;
const reduce = _.reduce;
const last = _.last;
const extend = _.extend;
const sortBy = _.sortBy;

// Setup debug log
const debug = require('abacus-debug')('abacus-hystrix');

// Resolve service URIs
const uris = urienv({
  auth_server: 9882
});

// Secure the hystrix.stream or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Compute a percentile from a list of values using the ranking algorithm at
// http://cnx.org/content/m10805/latest/,
// see http://en.wikipedia.org/wiki/Percentile#Alternative_methods
const percentile = (values, percent) => {
  // Compute a rank and low and high bounds
  const rank = percent / 100 * values.length;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);

  // Interpolate between closest ranks or the bounds
  return values.length === 0 ? 0 :
    high >= values.length ? values[values.length - 1] :
      low === high ? values[low] :
        Math.round(values[low] + (rank - low) * (values[high] - values[low]));
};

// Return a set of percentiles from a list of values in an object map
// Note that 50 is required by the Hystrix dashboard to show the median value
const percentiles = (values) => {
  return object(map([0, 25, 50, 75, 90, 95, 99, 99.5, 100], (percent) => [
    percent.toString(), percentile(values, percent)
  ]));
};

// Return the arithmetic mean of a list of values
const mean = (values) => {
  return reduce(values, (a, v) => a + v, 0) / (values.length || 1);
};

// Convert function call stats to a Hystrix command stats report
const command = (s) => {
  debug('Compute command stats for function %s', s.name);
  const counts = s.counts;
  const c = last(counts);
  debug('%d ok, %d errors, %d count buckets', c.ok, c.errors, counts.length);
  const latencies = s.latencies;
  const l = last(latencies);
  debug(
    '%d latencies, %d latencies buckets', l.latencies.length, latencies.length);
  const health = s.health;
  const h = last(health);
  debug('%d ok, %d errors, %d health buckets', h.ok, h.errors, health.length);

  // Return a Hystrix command stats report
  return extend({
    type: 'HystrixCommand',
    name: s.name,
    group: s.name,

    // Current command state
    currentTime: s.time,
    isCircuitBreakerOpen: s.circuit === 'open' || s.circuit ===
      'half-open',
    currentConcurrentExecutionCount: 0
  },
    // Return the last report from the rolling health reports
    /* eslint no-extra-parens: 1 */
    (() => {
      const h = last(s.health);
      return h ? {
        requestCount: h.ok + h.errors,
        errorCount: h.errors,
        errorPercentage: h.errors / (h.ok + h.errors || 1) * 100
      } : {
        requestCount: 0,
        errorCount: 0,
        errorPercentage: 0
      };
    })(),
    // Sum the counts accumulated in the rolling count buckets
    (() => {
      const c = reduce(s.counts, (a, c) => ({
        ok: a.ok + c.ok,
        errors: a.errors + c.errors,
        timeouts: a.timeouts + c.timeouts,
        rejects: a.rejects + c.rejects
      }), {
        ok: 0,
        errors: 0,
        timeouts: 0,
        rejects: 0
      });
      return {
        rollingCountCollapsedRequests: 0,
        rollingCountBadRequests: 0,
        rollingCountExceptionsThrown: c.errors,
        rollingCountFailure: c.errors,
        rollingCountFallbackFailure: 0,
        rollingCountFallbackRejection: 0,
        rollingCountFallbackSuccess: 0,
        rollingCountResponsesFromCache: 0,
        rollingCountSemaphoreRejected: 0,
        rollingCountShortCircuited: c.rejects,
        rollingCountSuccess: c.ok,
        rollingCountThreadPoolRejected: 0,
        rollingCountTimeout: c.timeouts
      };
    })(),
    // Compute the arithmetic mean latency and the latency percentiles from
    // the latencies accumulated in the rolling latency buckets
    (() => {
      const l = sortBy(
        reduce(s.latencies, (a, l) => a.concat(l.latencies), []), (v) => v);
      const p = percentiles(l);
      const m = mean(l);
      return {
        latencyExecute: p,
        latencyExecute_mean: m,
        latencyTotal: p,
        latencyTotal_mean: m
      };
    })(),
    // Mix in the Hystrix config
    {
      propertyValue_circuitBreakerRequestVolumeThreshold: 20,
      propertyValue_circuitBreakerSleepWindowInMilliseconds: 5000,
      propertyValue_circuitBreakerErrorThresholdPercentage: 50,
      propertyValue_circuitBreakerForceOpen: false,
      propertyValue_circuitBreakerForceClosed: false,
      propertyValue_circuitBreakerEnabled: true,
      propertyValue_executionIsolationStrategy: 'THREAD',
      propertyValue_executionIsolationThreadTimeoutInMilliseconds: 800,
      propertyValue_executionIsolationThreadInterruptOnTimeout: true,
      propertyValue_executionIsolationThreadPoolKeyOverride: null,
      propertyValue_executionIsolationSemaphoreMaxConcurrentRequests: 20,
      propertyValue_fallbackIsolationSemaphoreMaxConcurrentRequests: 10,
      propertyValue_metricsRollingStatisticalWindowInMilliseconds: 10000,
      propertyValue_requestCacheEnabled: true,
      propertyValue_requestLogEnabled: true,
      reportingHosts: 1
    });
};

// Return Oauth system scopes needed to read system status
const rscope = () => secured() ? {
  system: ['abacus.system.read']
} : undefined;

// Return an Express middleware that serves a Hystrix event stream
const stream = () => {
  return (req, res, next) => {
    if(req.path === '/hystrix.stream') {
      const openStream = () => {
        // Keep the text/even-stream response open forever
        req.socket.setTimeout(0);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
          'Connection': 'keep-alive'
        });
    
        // Write the latest Hystrix command stats right away, then
        // periodically as specified in the client request or every 2000 ms
        const write = () => {
          const now = Date.now();
          const all = values(perf.all(now));
          if(all.length)
            map(all, (s) => {
              res.write('data: ' + JSON.stringify(command(s)) + '\n\n');
              if(res.flush) res.flush();
            });
          else {
            res.write('ping:\n\n');
            if(res.flush) res.flush();
          }
        };
        write();
        const writer = setInterval(write,
          Math.max(req.query.delay || 2000, 200));
    
        // Stop when the request closes
        req.on('close', () => {
          clearInterval(writer);
        });
      };

      if(secured()) {
        // Get basic token
        const auth = req.headers && req.headers.authorization;
        // Extracts username and password
        const user = oauth.decodeBasicToken(auth);
        // Get bearer token from UAA to get the credentials
        oauth.getBearerToken(uris.auth_server, user[0],
          user[1], 'abacus.system.read', (err, token) => {
            if(err)
              throw err;
            oauth.authorize(token, rscope());
            openStream();
          });
      }
      else
        openStream();
    }
    else next();
  };
};

// Export our public functions
module.exports.stream = stream;
