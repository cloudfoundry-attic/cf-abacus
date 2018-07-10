'use strict';

const httpStatus = require('http-status-codes');
const map = require('./map');

const edebug = require('abacus-debug')('e-abacus-express');
const xdebug = require('abacus-debug')('x-abacus-express');

const requestsPerResourceIdsMap = map();

const resourceProviderKeyGenerator = (req, secured) => {
  if (secured)
    if (req.context && req.context.oauth)
      return req.context.oauth.scopes.readResourceScopes[0]
        || req.context.oauth.scopes.writeResourceScopes[0];
    else
      return 'non-client';
  return 'unknown';
};

class CompositeCounter {
  constructor(server, resourceId) {
    this.server = server;
    this.resourceId = resourceId;

    // server.inflight keeps the total number of ongoing requests,
    // as well as the counts to specific types of requests.
    // assigning to server is necessary so that state is preserved
    // across requests, is specific to server listener, and is available
    // to downstream middleware functions
    this.server.inflight = this.server.inflight || {
      total: 0
    };
  }

  get inflight() {
    return this.server.inflight;
  }

  get(key) {
    return this.inflight[key] || 0;
  }

  increment(key) {
    this.inflight[key] = this.get(key) + 1;
    this.inflight.total++;
    requestsPerResourceIdsMap.increment(this.resourceId);
    xdebug('Inflight requests: %d', this.inflight.total);
  }

  decrement(key) {
    this.inflight[key] = this.get(key) - 1;
    this.inflight.total--;
    requestsPerResourceIdsMap.decrement(this.resourceId);
    xdebug('Inflight requests: %d', this.inflight.total);
    if (this.inflight.total === 0)
      this.server.emit('quiet');
  }

};

class Counter {
  constructor(key, compositeCounter, maxCount) {
    this.key = key;
    this.maxCount = maxCount;
    this.compositeCounter = compositeCounter;
  }

  getKey() {
    return this.key;
  }

  increment() {
    this.compositeCounter.increment(this.key);
  }

  decrement() {
    this.compositeCounter.decrement(this.key);
  }

  isFull() {
    return this.compositeCounter.get(this.key) >= this.maxCount;
  }

  toString() {
    return `${this.key}: ${this.compositeCounter.get(this.key)} (max ${this.maxCount})`;
  }
};

const getServer = (req) => {
  return req.client.server ? req.client.server : req.client.socket.server;
};

const isOAuthRequest = (req) => {
  return req.context && req.context.oauth;
};

const isClientRequest = (req) => {
  const scopes = req.context.oauth.scopes;
  return !scopes.hasSystemReadScope && !scopes.hasSystemWriteScope;
};

const sendServiceUnavailable = (res) => {
  res.status(httpStatus.SERVICE_UNAVAILABLE).send({
    message: 'The server is overloaded. Please try again later',
    status: httpStatus.SERVICE_UNAVAILABLE
  });
};

const inflight = (maxClientInflight, maxRemainingInflight, secured, systemEnabled) => {
  const createCounter = (req) => {
    const server = getServer(req);
    const resourceId = resourceProviderKeyGenerator(req, secured);
    const compositeCounter = new CompositeCounter(server, resourceId);
    if (!systemEnabled || !secured || (isOAuthRequest(req) && isClientRequest(req)))
      return new Counter('client', compositeCounter, maxClientInflight);

    return new Counter('remaining', compositeCounter, maxRemainingInflight);
  };

  return (req, res, next) => {
    const counter = createCounter(req);

    if (counter.isFull()) {
      edebug(`Inflight requests for ${counter}`);
      sendServiceUnavailable(res);
      return;
    }
    counter.increment();

    const done = () => {
      counter.decrement();
    };
    res.on('finish', done);
    res.on('close', done);

    /* The values in the map may not be exact because operations contained in increment/decrement are not atomic.
       They conatain get/set and additon/substraction */
    xdebug(`Inflight requests per resourceId ${requestsPerResourceIdsMap.toString()}`);

    next();
  };
};

module.exports = inflight;
