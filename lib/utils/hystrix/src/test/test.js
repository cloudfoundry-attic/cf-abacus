'use strict';

// Support for Netflix Hystrix, serves a stream of Hystrix command stats

const hystrix = require('..');
const perf = require('abacus-perf');

describe('abacus-hystrix', () => {
  let clock;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(Date.now());
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('serves a stream of hystrix stats', () => {
    // Get hystrix Express middleware
    const stream = hystrix.stream();

    const next = spy();
    const res = {};
    const socket = {
      setTimeout: stub().returns(res)
    };
    res.writeHead = stub().returns(res);
    res.write = stub().returns(res);
    res.flush = stub().returns(res);
    const on = spy();

    // Expect middleware to only process /hystrix.stream path
    stream({
      path: '/else'
    }, res, next);
    expect(next.args.length).to.equal(1);

    // Expect middleware to return a Hystrix stats stream
    stream({
      path: '/hystrix.stream',
      query: {
        delay: 1000
      },
      socket: socket,
      on: on
    }, res, next);

    // Expect middleware to register a close listener
    expect(on.args[0][0]).to.equal('close');

    // Expect proper socket configuration, status code and HTTP headers
    expect(socket.setTimeout.args).to.deep.equal([
      [0]
    ]);
    expect(res.writeHead.args).to.deep.equal([
      [200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Connection': 'keep-alive'
      }]
    ]);

    // Expect a Hystrix ping report
    expect(res.write.args[0]).to.deep.equal(['ping:\n\n']);
    expect(res.flush.args.length).to.equal(1);

    // Run the next time interval
    clock.tick(1100);

    // Expect a second Hystrix ping report
    expect(res.write.args.length).to.equal(2);
    expect(res.write.args[1]).to.deep.equal(['ping:\n\n']);
    expect(res.flush.args.length).to.equal(2);

    // Report a few function call metrics
    const t = Date.now();
    clock.tick(10);

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

    // Run the next time interval
    clock.tick(1100);

    // Expect a Hystrix stats reports
    expect(res.write.args.length).to.equal(3);
    expect(res.flush.args.length).to.equal(3);
    expect(res.write.args[2]).to.deep.equal([
      'data: {"type":"HystrixCommand",' +
      '"name":"foo",' +
      '"group":"foo",' +
      '"currentTime":' +
      (t + 900) +
      ',"isCircuitBreakerOpen":true,' +
      '"currentConcurrentExecutionCount":0,' +
      '"requestCount":4,' +
      '"errorCount":3,' +
      '"errorPercentage":75,' +
      '"rollingCountCollapsedRequests":0,' +
      '"rollingCountExceptionsThrown":1,' +
      '"rollingCountFailure":1,' +
      '"rollingCountFallbackFailure":0,' +
      '"rollingCountFallbackRejection":0,' +
      '"rollingCountFallbackSuccess":0,' +
      '"rollingCountResponsesFromCache":0,' +
      '"rollingCountSemaphoreRejected":0,' +
      '"rollingCountShortCircuited":1,' +
      '"rollingCountSuccess":1,' +
      '"rollingCountThreadPoolRejected":0,' +
      '"rollingCountTimeout":1,' +
      '"latencyExecute":{"0":10,"25":10,"50":10,"75":10,"90":10,"95":10,' +
      '"99":10,"100":10,"99.5":10},' +
      '"latencyExecute_mean":10,' +
      '"latencyTotal":{"0":10,"25":10,"50":10,"75":10,"90":10,"95":10,' +
      '"99":10,"100":10,"99.5":10},' +
      '"latencyTotal_mean":10,' +
      '"propertyValue_circuitBreakerRequestVolumeThreshold":20,' +
      '"propertyValue_circuitBreakerSleepWindowInMilliseconds":5000,' +
      '"propertyValue_circuitBreakerErrorThresholdPercentage":50,' +
      '"propertyValue_circuitBreakerForceOpen":false,' +
      '"propertyValue_circuitBreakerForceClosed":false,' +
      '"propertyValue_circuitBreakerEnabled":true,' +
      '"propertyValue_executionIsolationStrategy":"THREAD",' +
      '"propertyValue_executionIsolationThreadTimeoutInMilliseconds":800,' +
      '"propertyValue_executionIsolationThreadInterruptOnTimeout":true,' +
      '"propertyValue_executionIsolationThreadPoolKeyOverride":null,' +
      '"propertyValue_executionIsolationSemaphoreMaxConcurrentRequests":20,' +
      '"propertyValue_fallbackIsolationSemaphoreMaxConcurrentRequests":10,' +
      '"propertyValue_metricsRollingStatisticalWindowInMilliseconds":10000,' +
      '"propertyValue_requestCacheEnabled":true,' +
      '"propertyValue_requestLogEnabled":true,' +
      '"reportingHosts":1}\n\n'
    ]);

    // Close the stream
    on.args[0][1]();
  });
});
