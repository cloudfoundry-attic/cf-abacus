'use strict';

module.exports = (serviceMock) => ({
  received: (numberOfRequests) => function *() {
    return serviceMock.requests().length >= numberOfRequests;
  }
});

